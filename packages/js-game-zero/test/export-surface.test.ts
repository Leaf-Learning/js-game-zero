import { expect, test } from "bun:test";
import * as core from "js-game-zero";
import * as host from "js-game-zero/host";
import * as node from "js-game-zero/node";

const learnerValues = [
  "Actor",
  "Animation",
  "Clock",
  "CreatedTone",
  "DEFAULT_TONE_VOLUME",
  "ImageSurface",
  "InvalidAssetNameError",
  "JsonStorageError",
  "KeyboardState",
  "MissingAssetError",
  "Rect",
  "Screen",
  "Storage",
  "ValueError",
  "ZRect",
  "angleTo",
  "animate",
  "clamp",
  "clock",
  "defineGame",
  "distanceTo",
  "exit",
  "fonts",
  "images",
  "keyboard",
  "keymods",
  "keys",
  "mouse",
  "music",
  "randomChoice",
  "randomInt",
  "rgb",
  "run",
  "screen",
  "sounds",
  "storage",
  "tone",
  "tweenNames",
  "tweens",
] as const;

const legacyHostValues = [
  "AudioUnlockState",
  "BrowserSoundAsset",
  "InputDispatcher",
  "MusicPlayer",
  "ToneGenerator",
  "assetUrl",
  "audioUnlock",
  "buttonsFromBrowserButtons",
  "clampVolume",
  "collectRuntimeDiagnostics",
  "createAssetLoaders",
  "createBrowserSoundAsset",
  "createFontLoader",
  "createImageLoader",
  "createInputDispatcher",
  "createLocalStorageAdapter",
  "createMusicLoader",
  "createMusicPlayer",
  "createSoundLoader",
  "createStorage",
  "createToneGenerator",
  "dispatchHook",
  "fitTextboxFontSize",
  "getParameterNames",
  "getScreen",
  "layoutText",
  "mapBrowserKeyEvent",
  "mapBrowserMouseButton",
  "mapBrowserMouseEvent",
  "mapBrowserWheelEvent",
  "normalizeColor",
  "normalizeWaveform",
  "noteToFrequency",
  "parseToneFrequency",
  "setScreen",
  "validateAssetName",
] as const;

const approvedCoreValues = [...learnerValues, ...legacyHostValues] as const;
const approvedHostValues = [
  ...legacyHostValues,
  "createSeededRandom",
  "getGameInspector",
  "loadImages",
  "parseStatePath",
  "serializeGameValue",
] as const;

test("the public entry points expose only their approved runtime values", () => {
  expect(Object.keys(core).sort()).toEqual([...approvedCoreValues].sort());
  expect(Object.keys(host).sort()).toEqual([...approvedHostValues].sort());
  expect(Object.keys(node)).toEqual(["createSandboxFileStorageAdapter"]);
});

test("the script-tag build's window.JGZ is the framework, with the host APIs a page uses", async () => {
  const page = globalThis as { window?: { JGZ?: Record<string, unknown> } };
  const before = page.window;
  page.window = {};
  try {
    await import("../src/browser");
    const jgz = page.window.JGZ ?? {};
    const pageHost = approvedHostValues.filter(
      (name) => !(legacyHostValues as readonly string[]).includes(name),
    );
    expect(Object.keys(jgz).sort()).toEqual(
      [...approvedCoreValues, ...pageHost].sort(),
    );
    for (const name of approvedCoreValues) {
      expect(jgz[name]).toBe((core as Record<string, unknown>)[name]);
    }
    for (const name of pageHost) {
      expect(jgz[name]).toBe((host as Record<string, unknown>)[name]);
    }
  } finally {
    if (before === undefined) delete page.window;
    else page.window = before;
  }
});
