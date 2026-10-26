export type ExampleMode = "global" | "import";

export type ExampleManifestEntry = {
  readonly slug: string;
  readonly title: string;
  /** One sentence for learners, shown on the sandbox's example gallery. */
  readonly description: string;
  readonly mode: ExampleMode;
  readonly entryPoint: string;
  readonly assets: readonly string[];
  readonly smokeMarker: "__jgzExampleStatus";
  readonly tutorial: string;
  /** What the example's browser test checks; not shown to learners. */
  readonly e2eScenario: string;
  readonly expectsInput: "keyboard" | "mouse" | "none";
  readonly visual: boolean;
  /** Where the sandbox's example gallery lists it: short programs that each
   * show one idea, then sounds and saving, then whole games. */
  readonly gallery: ExampleGalleryGroup;
};

export type ExampleGalleryGroup = "start-here" | "try-next" | "full-game";

export const exampleManifest = [
  {
    slug: "drawing-basics",
    title: "Drawing Basics",
    description:
      "Draw a rectangle, line, circle and polygon on a gradient, and make the circle pulse.",
    mode: "global",
    entryPoint: "examples/drawing-basics/main.js",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/drawing-basics/README.md",
    e2eScenario: "renders deterministic canvas primitives",
    expectsInput: "none",
    visual: true,
    gallery: "start-here",
  },
  {
    slug: "actor-movement",
    title: "Actor Movement",
    description: "Move a character left and right with the arrow keys.",
    mode: "global",
    entryPoint: "examples/actor-movement/main.js",
    assets: ["images/player.svg"],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/actor-movement/README.md",
    e2eScenario: "moves the actor with the keyboard",
    expectsInput: "keyboard",
    visual: true,
    gallery: "start-here",
  },
  {
    slug: "sound-tone",
    title: "Sound and Tone",
    description: "Click to play a sound effect and a short generated tone.",
    mode: "global",
    entryPoint: "examples/sound-tone/main.js",
    assets: ["sounds/click.ogg"],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/sound-tone/README.md",
    e2eScenario: "plays a loaded sound and schedules a tone on click",
    expectsInput: "mouse",
    visual: true,
    gallery: "try-next",
  },
  {
    slug: "animation-basics",
    title: "Animation Basics",
    description:
      "Glide a circle across the screen with animate() and an easing curve.",
    mode: "global",
    entryPoint: "examples/animation-basics/main.js",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/animation-basics/README.md",
    e2eScenario: "runs top-level animate on the game clock",
    expectsInput: "none",
    visual: true,
    gallery: "start-here",
  },
  {
    slug: "sandbox-starter",
    title: "Sandbox Starter",
    description:
      "Move a circle with the arrow keys, in a game that imports what it uses instead of using globals.",
    mode: "import",
    entryPoint: "examples/sandbox-starter/main.ts",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/sandbox-starter/README.md",
    e2eScenario: "runs explicit imports and responds to keyboard input",
    expectsInput: "keyboard",
    visual: true,
    gallery: "try-next",
  },
  {
    slug: "storage-save",
    title: "Storage Save",
    description:
      "Change a score, save it, and load it back, even after a reload.",
    mode: "global",
    entryPoint: "examples/storage-save/main.js",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/storage-save/README.md",
    e2eScenario: "edits, saves, and loads a score with visible buttons",
    expectsInput: "mouse",
    visual: true,
    gallery: "try-next",
  },
  {
    slug: "tappy-plane",
    title: "Tappy Plane",
    description:
      "Click to keep a plane in the air and fly it through gaps in the mountains.",
    mode: "global",
    entryPoint: "examples/tappy-plane/main.js",
    assets: [
      "images/background.png",
      "images/plane.png",
      "images/rock_top.png",
      "images/rock_bottom.png",
      "sounds/flap.ogg",
      "sounds/hit.ogg",
      "sounds/score.ogg",
    ],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/tappy-plane/README.md",
    e2eScenario:
      "flies a plane through scrolling mountain gaps and saves a high score",
    expectsInput: "mouse",
    visual: true,
    gallery: "full-game",
  },
  {
    slug: "breakout",
    title: "Breakout",
    description: "Bounce a ball off your paddle to clear a wall of bricks.",
    mode: "global",
    entryPoint: "examples/breakout/main.js",
    assets: [
      "images/paddle.png",
      "images/ball.png",
      "images/brick_red.png",
      "images/brick_yellow.png",
      "images/brick_green.png",
      "images/brick_blue.png",
      "images/brick_purple.png",
      "sounds/bounce.ogg",
      "sounds/brick.ogg",
      "sounds/lose.ogg",
    ],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/breakout/README.md",
    e2eScenario: "bounces a ball off a mouse-controlled paddle to clear bricks",
    expectsInput: "mouse",
    visual: true,
    gallery: "full-game",
  },
  {
    slug: "space-shooter",
    title: "Space Shooter",
    description:
      "Fly a ship and shoot down waves of enemies that get faster as you clear them.",
    mode: "global",
    entryPoint: "examples/space-shooter/main.js",
    assets: [
      "images/player_ship.png",
      "images/enemy_ship.png",
      "images/laser.png",
      "images/explosion_0.png",
      "images/explosion_1.png",
      "images/explosion_2.png",
      "images/explosion_3.png",
      "images/explosion_4.png",
      "sounds/laser.ogg",
      "sounds/explosion.ogg",
      "sounds/hit.ogg",
    ],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/space-shooter/README.md",
    e2eScenario:
      "flies a ship through descending enemy waves with lasers and escalating difficulty",
    expectsInput: "keyboard",
    visual: true,
    gallery: "full-game",
  },
  {
    slug: "snake",
    title: "Snake",
    description:
      "Steer a growing snake to the fruit without hitting a wall or your tail.",
    mode: "global",
    entryPoint: "examples/snake/main.js",
    assets: ["images/fruit.png", "sounds/eat.ogg", "sounds/die.ogg"],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/snake/README.md",
    e2eScenario:
      "steers a grid snake with the clock-driven schedule and persists a high score",
    expectsInput: "keyboard",
    visual: true,
    gallery: "full-game",
  },
  {
    slug: "platformer",
    title: "Platformer",
    description:
      "Run and jump across platforms to collect gems and reach the flag.",
    mode: "global",
    entryPoint: "examples/platformer/main.js",
    assets: [
      "images/ground_top.png",
      "images/ground_fill.png",
      "images/gem.png",
      "images/flag.png",
      "images/water.png",
      "images/tree.png",
      "images/player.png",
      "sounds/jump.ogg",
      "sounds/coin.ogg",
    ],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/platformer/README.md",
    e2eScenario:
      "runs and jumps a hand-built tile level to collect gems and reach the flag",
    expectsInput: "keyboard",
    visual: true,
    gallery: "full-game",
  },
] as const satisfies readonly ExampleManifestEntry[];

export function getExample(slug: string): ExampleManifestEntry | undefined {
  // Keep existing example links and saved clone requests working after the rename.
  const canonicalSlug = slug === "flappy-bird" ? "tappy-plane" : slug;
  return exampleManifest.find((example) => example.slug === canonicalSlug);
}
