import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import {
  Actor,
  Animation,
  Clock,
  ImageSurface,
  Rect,
  Storage,
  keys,
  type ActorOptions,
  type DrawableImage,
  type GameContext,
} from "@js-game-zero/core";
import { dispatchHook } from "@js-game-zero/core/host";
import { exampleManifest, getExample } from "../../../examples/manifest";
import { game as starterGame } from "../../../examples/sandbox-starter/game";

// Execute the shipped learner source unchanged. Real Actor geometry, image
// dimensions, clock and storage keep deterministic gameplay checks honest;
// rendering and audio are checked separately in the browser suite.
async function game(slug: string) {
  const example = getExample(slug)!;
  const surfaces = new Map<string, ImageSurface>();
  for (const asset of example.assets) {
    if (!asset.startsWith("images/")) continue;
    const bytes = await readFile(
      join(dirname(example.entryPoint), "assets", asset),
    );
    let width: number;
    let height: number;
    if (asset.endsWith(".svg")) {
      width = Number(/width="(\d+)"/.exec(bytes.toString())![1]);
      height = Number(/height="(\d+)"/.exec(bytes.toString())![1]);
    } else {
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
    }
    const surface = new ImageSurface({ width, height } as DrawableImage);
    const name = asset.slice("images/".length);
    surfaces.set(name, surface);
    surfaces.set(name.replace(/\.[^.]+$/, ""), surface);
  }
  const loader = {
    get: (name: string) => surfaces.get(name),
    load: async (name: string) => {
      const surface = surfaces.get(name);
      if (!surface) throw new Error(`Undeclared example sprite: ${name}`);
      return surface;
    },
    unload: () => false,
  };
  const clock = new Clock({
    onError: (error) => {
      throw error;
    },
  });
  let saved: string | null = null;
  let saveFailure = false;
  let loadFailure = false;
  const storage = new Storage({
    adapter: {
      path: "test-storage",
      load: async () => {
        if (loadFailure) throw new Error("Storage unavailable");
        return saved;
      },
      save: (text) => {
        if (saveFailure) throw new Error("Storage full");
        saved = text;
      },
    },
  });
  const text: string[] = [];
  const noop = () => {};
  const context = createContext({
    WIDTH: 0,
    HEIGHT: 0,
    TITLE: "",
    TILE_SIZE: 0,
    Actor: class extends Actor {
      constructor(image: string, options: ActorOptions = {}) {
        super(image, { ...options, imageLoader: loader });
      }
      override draw() {}
    },
    Rect,
    clock,
    storage,
    keys,
    keyboard: {},
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    animate: (target: object, options: object) =>
      new Animation(target, options, clock),
    sounds: new Proxy({}, { get: () => ({ play: noop }) }),
    tone: { play: noop },
    screen: {
      fill: noop,
      blit: noop,
      draw: new Proxy(
        { text: (value: string) => text.push(value) },
        {
          get: (target, key) => (key === "text" ? target.text : noop),
        },
      ),
    },
  });
  runInContext(await readFile(example.entryPoint, "utf8"), context);
  const evaluate = (source: string): ReturnType<typeof runInContext> =>
    runInContext(source, context);
  return {
    evaluate,
    clock,
    storage,
    text,
    failSaves() {
      saveFailure = true;
    },
    failLoads() {
      loadFailure = true;
    },
    click(pos: [number, number]) {
      dispatchHook(evaluate("on_mouse_down"), { pos });
    },
    frame(dt = 1 / 60) {
      clock.tick(dt);
      evaluate(`if (typeof update === 'function') update(${dt}); draw();`);
    },
  };
}

for (const example of exampleManifest.filter(
  (entry) => entry.mode === "global",
)) {
  test(`${example.slug}: shipped source runs and draws for ten seconds`, async () => {
    const exampleGame = await game(example.slug);
    for (let frame = 0; frame < 600; frame += 1) exampleGame.frame();
    expect(exampleGame.evaluate("WIDTH > 0 && HEIGHT > 0")).toBe(true);
  });
}

test("Tappy Plane permits transparent mountain corners at several rotations", async () => {
  const g = await game("tappy-plane");
  g.evaluate("rockBottom.pos = [110, 260]; rockTop.pos = [110, 90];");
  for (const angle of [-25, 0, 45, 75]) {
    g.evaluate(`plane.center = [125, 265]; plane.angle = ${angle};`);
    expect(g.evaluate("hitsRock(rockBottom)")).toBe(false);
    g.evaluate("plane.center = [174, 370];");
    expect(g.evaluate("hitsRock(rockBottom)")).toBe(true);
    g.evaluate("plane.center = [125, 90];");
    expect(g.evaluate("hitsRock(rockTop)")).toBe(false);
    g.evaluate("plane.center = [174, -20];");
    expect(g.evaluate("hitsRock(rockTop)")).toBe(true);
  }
  g.evaluate(
    "plane.center = [140, 200]; plane.angle = 0; plane.vy = 0; rockBottom.pos = [110, 198];",
  );
  g.frame(0);
  expect(g.evaluate("plane.crashed")).toBe(false);
  g.evaluate("plane.center = [174, 320];");
  g.frame(0);
  expect(g.evaluate("plane.crashed")).toBe(true);
  g.evaluate("on_key_down(keys.SPACE);");
  expect(g.evaluate("plane.crashed")).toBe(false);
});

test("Space Shooter advances after the last laser kill and keeps later waves above the player", async () => {
  const g = await game("space-shooter");
  for (let wave = 1; wave <= 16; wave += 1) {
    g.evaluate(
      "lasers = enemies.map(enemy => new Actor('laser', {center: enemy.center}));",
    );
    g.frame(0);
    expect(g.evaluate("wave")).toBe(wave + 1);
    expect(g.evaluate("enemies.length")).toBeGreaterThan(0);
    expect(
      g.evaluate("Math.max(...enemies.map(enemy => enemy.bottom))"),
    ).toBeLessThan(g.evaluate("PLAYER_TOP_LIMIT"));
    expect(g.evaluate("lives")).toBe(3);
  }
  expect(g.evaluate("score")).toBeGreaterThan(0);
  g.evaluate("state = 'gameover'; fireCooldown = 0.27; resetGame();");
  expect(g.evaluate("[wave, lives, score, fireCooldown]")).toEqual([
    1, 3, 0, 0,
  ]);
});

test("Space Shooter advances after contact but never spawns after a fatal hit", async () => {
  const g = await game("space-shooter");
  g.evaluate("enemies = [new Actor('enemy_ship', {center: player.center})];");
  g.frame(0);
  expect(g.evaluate("[wave, lives]")).toEqual([2, 2]);
  g.evaluate(
    "lives = 1; invulnerableTime = 0; enemies = [new Actor('enemy_ship', {center: player.center})];",
  );
  g.frame(0);
  expect(g.evaluate("[wave, lives, state, enemies.length]")).toEqual([
    2,
    0,
    "gameover",
    0,
  ]);
});

test("Snake fruit fits its cell and rapid turns execute on separate clock ticks", async () => {
  const g = await game("snake");
  expect(g.evaluate("[apple.width, apple.height]")).toEqual([28, 28]);
  expect(g.evaluate("apple.top >= HUD_HEIGHT")).toBe(true);
  g.evaluate("apple.cell = {x:0,y:0}; apple.center = cellCenter(apple.cell);");
  expect(g.evaluate("apple.top")).toBe(34);
  g.evaluate("on_key_down(keys.DOWN); on_key_down(keys.LEFT);");
  g.clock.tick(0.18);
  expect(g.evaluate("snake[0]")).toEqual({ x: 8, y: 8 });
  g.clock.tick(0.18);
  expect(g.evaluate("snake[0]")).toEqual({ x: 7, y: 8 });
  expect(g.evaluate("state")).toBe("playing");
});

test("Snake reacts to the new key even while another direction is held", async () => {
  const g = await game("snake");
  g.evaluate("keyboard.right = true; on_key_down(keys.DOWN);");
  g.clock.tick(0.18);
  expect(g.evaluate("snake[0]")).toEqual({ x: 8, y: 8 });
});

test("Snake allows a vacating tail cell but still rejects body collisions", async () => {
  const g = await game("snake");
  g.evaluate(
    "snake = [{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2}]; direction = {x:-1,y:0}; apple.cell = {x:10,y:10};",
  );
  g.clock.tick(0.18);
  expect(g.evaluate("state")).toBe("playing");
  expect(g.evaluate("snake[0]")).toEqual({ x: 1, y: 2 });
  g.evaluate("direction = {x:1,y:0};");
  g.clock.tick(0.18);
  expect(g.evaluate("state")).toBe("dead");
});

test("Snake grows, accelerates and saves a high score when eating", async () => {
  const g = await game("snake");
  g.evaluate("apple.cell = {x:9,y:7};");
  g.clock.tick(0.18);
  expect(g.evaluate("[score, snake.length, moveInterval]")).toEqual([
    1, 4, 0.172,
  ]);
  expect(g.storage.get("highscore")).toBe(1);
  expect(
    g.evaluate(
      "snake.some(segment => segment.x === apple.cell.x && segment.y === apple.cell.y)",
    ),
  ).toBe(false);
  g.clock.tick(0.172);
  expect(g.evaluate("snake[0]")).toEqual({ x: 10, y: 7 });
});

test("Snake wins on a full board and can restart with one movement schedule", async () => {
  const g = await game("snake");
  g.evaluate(
    "snake = []; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) snake.push({x,y}); placeApple(); draw();",
  );
  expect(g.evaluate("[state, apple]")).toEqual(["won", null]);
  expect(g.text).toContain("You win!");
  g.evaluate("on_key_down(keys.SPACE);");
  g.clock.tick(0.18);
  expect(g.evaluate("[state, snake[0], snake.length]")).toEqual([
    "playing",
    { x: 9, y: 7 },
    3,
  ]);
});

test("Platformer uses tile-sized player geometry and can jump immediately after respawning", async () => {
  const g = await game("platformer");
  expect(g.evaluate("[player.width, player.height]")).toEqual([54, 54]);
  g.evaluate(
    "coyoteTimer = 0; onGround = false; respawn(); on_key_down(keys.SPACE);",
  );
  expect(g.evaluate("player.vy")).toBe(-680);
  g.frame();
  expect(g.evaluate("player.bottom")).toBeLessThan(378);
});

test("Breakout wins, loses three lives, and restarts a complete brick wall", async () => {
  const g = await game("breakout");
  g.evaluate("bricks = [bricks[0]]; ball.center = bricks[0].center;");
  g.frame(0);
  expect(g.evaluate("[state, score, bricks.length]")).toEqual(["won", 10, 0]);
  g.evaluate("on_key_down(keys.SPACE);");
  expect(g.evaluate("[state, score, lives, bricks.length]")).toEqual([
    "playing",
    0,
    3,
    50,
  ]);
  for (let life = 2; life >= 0; life -= 1) {
    g.evaluate("ball.top = HEIGHT + 1;");
    g.frame(0);
    expect(g.evaluate("lives")).toBe(life);
  }
  expect(g.evaluate("state")).toBe("lost");
  g.click([0, 0]);
  expect(g.evaluate("[state, lives, bricks.length]")).toEqual([
    "playing",
    3,
    50,
  ]);
});

test("Platformer collects gems, wins at the flag, and resets the level", async () => {
  const g = await game("platformer");
  const gemCount = g.evaluate("gems.length");
  g.evaluate("player.center = gems[0].center;");
  g.frame(0);
  expect(g.evaluate("score")).toBe(1);
  expect(g.evaluate("gems.length")).toBe(gemCount - 1);
  g.evaluate("player.center = flag.center;");
  g.frame(0);
  expect(g.evaluate("state")).toBe("won");
  g.click([0, 0]);
  expect(g.evaluate("[state, score, gems.length, player.bottom]")).toEqual([
    "playing",
    0,
    gemCount,
    378,
  ]);
});

test("Storage Save changes current score independently, saves, loads, and never changes it each frame", async () => {
  const g = await game("storage-save");
  g.click([244, 236]);
  g.click([244, 236]);
  g.frame();
  expect(g.evaluate("score")).toBe(2);
  expect(g.storage.has("score")).toBe(false);
  g.click([396, 236]);
  await Bun.sleep(0); // wait for the button's asynchronous save
  expect(g.storage.get("score")).toBe(2);
  g.click([96, 236]);
  expect(g.evaluate("score")).toBe(1);
  g.click([544, 236]);
  await Bun.sleep(0);
  expect(g.evaluate("score")).toBe(2);
  g.frame();
  expect(g.text).toContain("Loaded saved score 2.");
});

test("Storage Save keeps the last confirmed score after failed writes and reads", async () => {
  const g = await game("storage-save");
  g.click([244, 236]);
  g.click([396, 236]);
  await Bun.sleep(0);
  expect(g.evaluate("savedScore")).toBe(1);
  g.click([244, 236]);
  g.failSaves();
  g.click([396, 236]);
  expect(g.evaluate("savedScore")).toBe(1);
  await Bun.sleep(0);
  expect(g.evaluate("[score, savedScore, busy]")).toEqual([2, 1, false]);
  expect(g.evaluate("message")).toContain("Couldn't save");
  // set() changed memory to 2, but loading must read the persisted 1.
  g.click([544, 236]);
  await Bun.sleep(0);
  expect(g.evaluate("[score, savedScore, busy]")).toEqual([1, 1, false]);
  g.click([244, 236]);
  g.failLoads();
  g.click([544, 236]);
  await Bun.sleep(0);
  expect(g.evaluate("[score, savedScore, busy]")).toEqual([2, 1, false]);
  expect(g.evaluate("message")).toContain("Couldn't load");
});

test("Platformer resolves platforms crossed during a long frame", async () => {
  const g = await game("platformer");
  // Falling at maximum speed crosses row 3 during a quarter-second frame.
  // Checking only the final position incorrectly lands on row 6 instead.
  g.evaluate(
    "flag = null; player.x = 13.5 * TILE_SIZE; player.bottom = 100; player.vy = MAX_FALL_SPEED;",
  );
  g.frame(0.25);
  expect(g.evaluate("[player.bottom, player.vy, onGround]")).toEqual([
    162,
    0,
    true,
  ]);
  for (let frame = 0; frame < 3; frame += 1) {
    g.frame();
    expect(g.evaluate("[player.bottom, player.vy, onGround]")).toEqual([
      162,
      0,
      true,
    ]);
  }
});

test("Platformer ignores repeated jump events but accepts a fresh press", async () => {
  const g = await game("platformer");
  g.evaluate("on_key_down(keys.SPACE, true);");
  expect(g.evaluate("player.vy")).toBe(0);
  g.evaluate("on_key_down(keys.SPACE, false);");
  expect(g.evaluate("player.vy")).toBe(-680);
});

test("Space Shooter explosions consume elapsed time and finish after game over", async () => {
  const g = await game("space-shooter");
  g.evaluate("explodeAt([100, 100]); state = 'gameover';");
  g.frame(0.24);
  expect(g.evaluate("explosions[0].frame")).toBe(4);
  g.frame(0.07);
  expect(g.evaluate("explosions.length")).toBe(0);
});

test("Space Shooter diagonal input preserves cardinal movement speed", async () => {
  const g = await game("space-shooter");
  g.evaluate(
    "player.center = [240, 500]; keyboard.right = keyboard.up = true;",
  );
  g.frame(0.1);
  const distance = g.evaluate("Math.hypot(player.x - 240, player.y - 500)");
  expect(distance).toBeCloseTo(26);
});

test("Actor Movement clamps a resized sprite using its actual bounds", async () => {
  const g = await game("actor-movement");
  g.evaluate("player.width = 80; keyboard.right = true;");
  g.frame(10);
  expect(g.evaluate("player.right")).toBe(320);
  g.evaluate("keyboard.right = false; keyboard.left = true;");
  g.frame(10);
  expect(g.evaluate("player.left")).toBe(0);
});

test("Sandbox Starter creates independent state for each scoped run", () => {
  const positions: number[] = [];
  const context = {
    keyboard: { right: true, left: false },
    keys,
    screen: {
      fill() {},
      draw: {
        filled_rect() {},
        filled_circle(pos: [number, number]) {
          positions.push(pos[0]);
        },
        text() {},
      },
    },
  } as unknown as GameContext;
  const first = starterGame.create(context);
  const second = starterGame.create(context);
  first.update?.(0.5);
  first.draw?.();
  second.draw?.();
  expect(positions).toEqual([134, 64]);
  first.onKeyDown?.({ key: keys.SPACE, repeat: false, unicode: " ", mod: 0 });
  first.draw?.();
  expect(positions.at(-1)).toBe(64);
});
