/** Advanced host-integration APIs. Learner games import the core root. */
import * as assets from "./assets";
import * as audio from "./audio";
import * as events from "./events";
import * as rendering from "./rendering";
import * as runtime from "./runtime";
import * as storage from "./storage";
import * as tone from "./tone";

export { AudioUnlockState, BrowserSoundAsset, MusicPlayer } from "./audio";
export { InputDispatcher } from "./events";
export { ToneGenerator } from "./tone";
export const assetUrl = assets.assetUrl;
export const audioUnlock = audio.audioUnlock;
export const buttonsFromBrowserButtons = events.buttonsFromBrowserButtons;
export const clampVolume = audio.clampVolume;
export const collectRuntimeDiagnostics = runtime.collectRuntimeDiagnostics;
export const createAssetLoaders = assets.createAssetLoaders;
export const createBrowserSoundAsset = audio.createBrowserSoundAsset;
export const createFontLoader = assets.createFontLoader;
export const createImageLoader = assets.createImageLoader;
export const createInputDispatcher = events.createInputDispatcher;
export const createLocalStorageAdapter = storage.createLocalStorageAdapter;
export const createMusicLoader = assets.createMusicLoader;
export const createMusicPlayer = audio.createMusicPlayer;
export const createSoundLoader = assets.createSoundLoader;
export const createStorage = storage.createStorage;
export const createToneGenerator = tone.createToneGenerator;
export const dispatchHook = events.dispatchHook;
export const fitTextboxFontSize = rendering.fitTextboxFontSize;
export const getParameterNames = events.getParameterNames;
export const getGameInspector = runtime.getGameInspector;
export const getScreen = rendering.getScreen;
export const layoutText = rendering.layoutText;
export const mapBrowserKeyEvent = events.mapBrowserKeyEvent;
export const mapBrowserMouseButton = events.mapBrowserMouseButton;
export const mapBrowserMouseEvent = events.mapBrowserMouseEvent;
export const mapBrowserWheelEvent = events.mapBrowserWheelEvent;
export const normalizeColor = rendering.normalizeColor;
export const normalizeWaveform = tone.normalizeWaveform;
export const noteToFrequency = tone.noteToFrequency;
export const parseToneFrequency = tone.parseToneFrequency;
export const setScreen = rendering.setScreen;
export const validateAssetName = assets.validateAssetName;

export type {
  AssetLoader,
  AssetLoaderOptions,
  AssetLoaders,
  DrawableImage,
  FontAsset,
  MusicAsset,
  SoundAsset,
  SurfaceLike,
} from "./assets";
export type {
  AudioElementFactory,
  AudioElementLike,
  BrowserSoundDebugState,
  BrowserSoundOptions,
  MusicPlayerOptions,
  TimeoutScheduler,
} from "./audio";
export type {
  BrowserKeyboardLike,
  BrowserMouseLike,
  BrowserWheelLike,
  MappedKeyboardEvent,
  MappedMouseEvent,
} from "./events";
export type { CanvasLike, TextLayout } from "./rendering";
export type {
  GameInspector,
  PreloadedAssets,
  RuntimeCanvas,
  RuntimeDiagnostic,
  RuntimeFailure,
  RuntimeFailurePhase,
  RuntimeScheduler,
} from "./runtime";
export type {
  BrowserStorageLike,
  LocalStorageAdapterOptions,
  StorageAdapter,
  StorageOptions,
} from "./storage";
export type {
  AudioContextLike,
  AudioParamLike,
  GainNodeLike,
  OscillatorNodeLike,
  ToneOptions,
} from "./tone";
