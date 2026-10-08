import { expect, test } from "bun:test";
import * as core from "@js-game-zero/core";
import * as host from "@js-game-zero/core/host";
import * as node from "@js-game-zero/core/node";
import * as browserRuntime from "@js-game-zero/browser-runtime";

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
  "random_choice",
  "random_int",
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
const approvedHostValues = [...legacyHostValues, "getGameInspector"] as const;

test("core public entry points expose only their approved runtime values", () => {
  expect(Object.keys(core).sort()).toEqual([...approvedCoreValues].sort());
  expect(Object.keys(host).sort()).toEqual([...approvedHostValues].sort());
  expect(Object.keys(node)).toEqual(["createSandboxFileStorageAdapter"]);
});

test("browser-runtime is exactly the learner-facing core facade", () => {
  const coreValues = core as Record<string, unknown>;
  const runtimeValues = browserRuntime as Record<string, unknown>;

  expect(Object.keys(runtimeValues).sort()).toEqual(
    [...approvedCoreValues].sort(),
  );
  for (const key of approvedCoreValues) {
    expect(runtimeValues[key]).toBe(coreValues[key]);
  }
});
