export type ExampleMode = "global" | "import";

export type ExampleManifestEntry = {
  readonly slug: string;
  readonly title: string;
  readonly mode: ExampleMode;
  readonly entryPoint: string;
  readonly assets: readonly string[];
  readonly smokeMarker: "__jgzExampleStatus";
  readonly tutorial: string;
  readonly e2eScenario: string;
  readonly expectsInput: "keyboard" | "mouse" | "none";
  readonly visual: boolean;
};

export const exampleManifest = [
  {
    slug: "drawing-basics",
    title: "Drawing Basics",
    mode: "global",
    entryPoint: "examples/drawing-basics/main.js",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/drawing-basics/README.md",
    e2eScenario: "renders deterministic canvas primitives",
    expectsInput: "none",
    visual: true,
  },
  {
    slug: "actor-movement",
    title: "Actor Movement",
    mode: "global",
    entryPoint: "examples/actor-movement/main.js",
    assets: ["images/player.svg"],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/actor-movement/README.md",
    e2eScenario: "moves the actor with the keyboard",
    expectsInput: "keyboard",
    visual: true,
  },
  {
    slug: "sound-tone",
    title: "Sound And Tone",
    mode: "global",
    entryPoint: "examples/sound-tone/main.js",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/sound-tone/README.md",
    e2eScenario: "plays a generated sound and schedules a tone on click",
    expectsInput: "mouse",
    visual: true,
  },
  {
    slug: "sandbox-starter",
    title: "Sandbox Starter",
    mode: "import",
    entryPoint: "examples/sandbox-starter/main.ts",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/sandbox-starter/README.md",
    e2eScenario: "runs explicit imports and responds to keyboard input",
    expectsInput: "keyboard",
    visual: true,
  },
  {
    slug: "storage-save",
    title: "Storage Save",
    mode: "global",
    entryPoint: "examples/storage-save/main.js",
    assets: [],
    smokeMarker: "__jgzExampleStatus",
    tutorial: "examples/storage-save/README.md",
    e2eScenario: "persists and draws a score with storage",
    expectsInput: "none",
    visual: true,
  },
] as const satisfies readonly ExampleManifestEntry[];

export function getExample(slug: string): ExampleManifestEntry | undefined {
  return exampleManifest.find((example) => example.slug === slug);
}
