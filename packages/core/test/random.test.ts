import { describe, expect, test } from "bun:test";
import {
  randomInt,
  run,
  type GameModule,
  type RuntimeCanvas,
} from "@js-game-zero/core";
import { createSeededRandom, getGameInspector } from "@js-game-zero/core/host";
import { hashSeed } from "../src/random";

class MockCanvas extends EventTarget {
  width = 0;
  height = 0;
  tabIndex = 0;

  getContext(contextId: "2d"): CanvasRenderingContext2D | null {
    return contextId === "2d"
      ? ({
          clearRect() {},
          fillRect() {},
          drawImage() {},
        } as unknown as CanvasRenderingContext2D)
      : null;
  }

  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }

  remove(): void {}
}

const canvas = () => new MockCanvas() as unknown as RuntimeCanvas;

/** The CLI's seeding before it moved into core, kept here as the reference. */
function cliReference(value: string): () => number {
  let seed: number;
  if (/^\d{1,9}$/.test(value)) seed = Number(value) >>> 0;
  else {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    seed = hash >>> 0;
  }
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const draw = (random: () => number, count: number) =>
  Array.from({ length: count }, () => random());

const SOURCE = `
let rolls = [Math.random(), Math.random(), randomInt(1, 1000), randomChoice(["a", "b", "c", "d"])];
let later = [];
function update(dt) {
  later.push(Math.random());
}
function draw() {}
`;

describe("seeded randomness", () => {
  test("hashes a seed the way the CLI always has", () => {
    expect(hashSeed("42")).toBe(42);
    expect(hashSeed(42)).toBe(42);
    expect(hashSeed("123456789")).toBe(123456789);
    expect(hashSeed("1234567890")).not.toBe(1234567890);
    expect(hashSeed(-1)).toBe(hashSeed("-1"));
    expect(hashSeed("repeatable")).toBe(hashSeed("repeatable"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
    expect(() => hashSeed(Number.NaN)).toThrow(TypeError);
    expect(() => hashSeed({} as unknown as string)).toThrow(TypeError);
  });

  test("gives the CLI's sequence for string and number seeds", () => {
    for (const seed of ["repeatable", "42", "0", "ninety-nine", "999999999"]) {
      expect(draw(createSeededRandom(seed), 20)).toEqual(
        draw(cliReference(seed), 20),
      );
    }
    expect(draw(createSeededRandom(7), 5)).toEqual(draw(cliReference("7"), 5));
    for (const value of draw(createSeededRandom("range"), 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("a seeded game repeats Math.random, randomInt and randomChoice, run after run", () => {
    const play = (seed: string | number) => {
      const handle = run(SOURCE, { canvas: canvas(), autostart: false, seed });
      handle.step(1 / 60);
      handle.step(1 / 60);
      const inspector = getGameInspector(handle)!;
      const state = {
        rolls: inspector.read("rolls"),
        later: inspector.read("later"),
      };
      handle.stop();
      return state;
    };
    const first = play("repeatable");
    expect(play("repeatable")).toEqual(first);
    expect(play("other")).not.toEqual(first);

    // The game's sequence is exactly the seed's: two Math.random, then the helpers.
    const reference = createSeededRandom("repeatable");
    const [a, b] = [reference(), reference()];
    const roll = 1 + Math.floor(reference() * 1000);
    const choice = ["a", "b", "c", "d"][Math.floor(reference() * 4)];
    expect(first.rolls).toEqual([a, b, roll, choice]);
    expect(first.later).toEqual([reference(), reference()]);
  });

  test("a restart starts the same sequence again", async () => {
    const handle = run("let first = Math.random(); function draw() {}", {
      canvas: canvas(),
      autostart: false,
      seed: 99,
    });
    const before = getGameInspector(handle)!.read("first");
    const restarted = await handle.restart();
    expect(getGameInspector(restarted)!.read("first")).toBe(before);
    restarted.stop();
  });

  test("seeding is the game's own: other games and the page keep their randomness", () => {
    const pageRandom = Math.random;
    const seeded = run(SOURCE, {
      canvas: canvas(),
      autostart: false,
      seed: "isolated",
    });
    const unseeded = run(
      "let values = []; function update() { values.push(Math.random()); } function draw() {}",
      { canvas: canvas(), autostart: false },
    );
    // The unseeded game and the page draw in between the seeded game's frames.
    unseeded.step(1 / 60);
    Math.random();
    seeded.step(1 / 60);
    unseeded.step(1 / 60);
    Math.random();
    seeded.step(1 / 60);

    expect(Math.random).toBe(pageRandom);
    const values = getGameInspector(unseeded)!.read("values") as number[];
    expect(values).toHaveLength(2);
    expect(values[0]).not.toBe(values[1]);

    const reference = createSeededRandom("isolated");
    draw(reference, 4);
    expect(getGameInspector(seeded)!.read("later")).toEqual([
      reference(),
      reference(),
    ]);
    seeded.stop();
    unseeded.stop();
  });

  test("leaves Math alone in an unseeded game", () => {
    const handle = run("let same = Math; function draw() {}", {
      canvas: canvas(),
      autostart: false,
    });
    expect(getGameInspector(handle)!.read("same")).toBe(Math);
    handle.stop();
  });

  test("a module game's randomInt follows the seed inside its hooks", () => {
    const rolls: number[] = [];
    const game: GameModule = {
      update() {
        rolls.push(randomInt(1, 1_000_000));
      },
      draw() {},
    };
    const play = () => {
      rolls.length = 0;
      const handle = run(game, {
        canvas: canvas(),
        autostart: false,
        seed: "module",
      });
      handle.step(1 / 60);
      handle.step(1 / 60);
      handle.stop();
      return [...rolls];
    };
    const first = play();
    expect(play()).toEqual(first);
    const reference = createSeededRandom("module");
    expect(first).toEqual([
      1 + Math.floor(reference() * 1_000_000),
      1 + Math.floor(reference() * 1_000_000),
    ]);
  });

  test("refuses a seed that isn't a string or a finite number", () => {
    expect(() =>
      run("function draw() {}", {
        canvas: canvas(),
        autostart: false,
        seed: Number.POSITIVE_INFINITY,
        diagnostics: () => {},
      }),
    ).toThrow("seed must be a finite number or a string");
  });
});
