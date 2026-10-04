// Intentional learner-facing package surface. Host integration and backend
// construction APIs live at @js-game-zero/core/host; filesystem persistence
// lives at @js-game-zero/core/node. Keep this list explicit so adding an
// internal export to a subsystem cannot silently become a public API change.
import * as actorModule from "./actor";
import * as animationModule from "./animation";
import * as assetsModule from "./assets";
import * as audioModule from "./audio";
import * as clockModule from "./clock";
import * as eventsModule from "./events";
import * as geometryModule from "./geometry";
import * as inputModule from "./input";
import * as renderingModule from "./rendering";
import * as runtimeModule from "./runtime";
import * as storageModule from "./storage";
import * as toneModule from "./tone";

// Namespace assignments keep the surface explicit and work around Bun 1.3's
// secondary-entry bundling bug for direct named re-exports. Matching type
// aliases preserve normal class-as-a-type usage for TypeScript consumers.
export const Actor = actorModule.Actor;
export type Actor = actorModule.Actor;
export type {
  ActorAnchor,
  ActorOptions,
  ActorPositionKey,
  HorizontalActorAnchor,
  VerticalActorAnchor,
} from "./actor";

export const Animation = animationModule.Animation;
export type Animation<T extends object = object> = animationModule.Animation<T>;
export const ValueError = animationModule.ValueError;
export type ValueError = animationModule.ValueError;
export const animate = animationModule.animate;
export const tweenNames = animationModule.tweenNames;
export const tweens = animationModule.tweens;
export type { AnimationOptions, TweenName } from "./animation";

export const ImageSurface = assetsModule.ImageSurface;
export type ImageSurface = assetsModule.ImageSurface;
export const InvalidAssetNameError = assetsModule.InvalidAssetNameError;
export type InvalidAssetNameError = assetsModule.InvalidAssetNameError;
export const MissingAssetError = assetsModule.MissingAssetError;
export type MissingAssetError = assetsModule.MissingAssetError;
export const fonts = assetsModule.fonts;
export const images = assetsModule.images;
export const sounds = assetsModule.sounds;
export type {
  AssetKind,
  AssetLoader,
  AssetLoaders,
  DrawableImage,
  FontAsset,
  LoadedAsset,
  MusicAsset,
  SoundAsset,
  SurfaceLike,
  SurfaceRectOptions,
} from "./assets";

export const music = audioModule.music;

export const Clock = clockModule.Clock;
export type Clock = clockModule.Clock;
export const clock = clockModule.clock;
export type { ClockOptions } from "./clock";

export const Rect = geometryModule.Rect;
export type Rect = geometryModule.Rect;
export const ZRect = geometryModule.ZRect;
export type ZRect = geometryModule.ZRect;
export const angleTo = geometryModule.angleTo;
export const distanceTo = geometryModule.distanceTo;
export type { Point, RectDict, RectLike, RectTuple, Size } from "./geometry";

export const KeyboardState = inputModule.KeyboardState;
export type KeyboardState = inputModule.KeyboardState;
export const keyboard = inputModule.keyboard;
export const keymods = inputModule.keymods;
export const keys = inputModule.keys;
export const mouse = inputModule.mouse;
export type {
  TouchButton,
  TouchControlsConfig,
  TouchControlsOptions,
} from "./touch-controls";

export const Screen = renderingModule.Screen;
export type Screen = renderingModule.Screen;
export const screen = renderingModule.screen;
export type {
  CanvasLike,
  Color,
  HorizontalAnchor,
  ScreenOptions,
  TextAlignOption,
  TextAnchor,
  TextOptions,
  TextboxOptions,
  VerticalAnchor,
} from "./rendering";

export const defineGame = runtimeModule.defineGame;
export const exit = runtimeModule.exit;
export const run = runtimeModule.run;
export type {
  DefinedGame,
  DefinedGameModule,
  GameContext,
  GameHandle,
  GameHandleState,
  GameKeyEvent,
  GameModule,
  GameMouseEvent,
  PreloadedAssets,
  RunOptions,
  RuntimeCanvas,
  RuntimeDiagnostic,
  RuntimeFailure,
  RuntimeFailurePhase,
  RuntimeMode,
  RuntimeScheduler,
} from "./runtime";

export const JsonStorageError = storageModule.JsonStorageError;
export type JsonStorageError = storageModule.JsonStorageError;
export const Storage = storageModule.Storage;
export type Storage = storageModule.Storage;
export const storage = storageModule.storage;
export type { JsonValue, StorageAdapter } from "./storage";

export const CreatedTone = toneModule.CreatedTone;
export type CreatedTone = toneModule.CreatedTone;
export const DEFAULT_TONE_VOLUME = toneModule.DEFAULT_TONE_VOLUME;
export const tone = toneModule.tone;
export type {
  TonePlayback,
  TonePlayOptions,
  ToneSpec,
  Waveform,
  WaveformAlias,
  WaveformInput,
} from "./tone";

// Browser-safe advanced imports are retained for the 0.1/0.2 compatibility
// window. New host code should use the explicit subpath; these aliases can be
// removed from the learner root in 1.0 without moving their implementation.
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const AudioUnlockState = audioModule.AudioUnlockState;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export type AudioUnlockState = audioModule.AudioUnlockState;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const BrowserSoundAsset = audioModule.BrowserSoundAsset;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export type BrowserSoundAsset = audioModule.BrowserSoundAsset;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const InputDispatcher = eventsModule.InputDispatcher;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export type InputDispatcher = eventsModule.InputDispatcher;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const MusicPlayer = audioModule.MusicPlayer;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export type MusicPlayer = audioModule.MusicPlayer;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const ToneGenerator = toneModule.ToneGenerator;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export type ToneGenerator = toneModule.ToneGenerator;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const assetUrl = assetsModule.assetUrl;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const audioUnlock = audioModule.audioUnlock;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const buttonsFromBrowserButtons = eventsModule.buttonsFromBrowserButtons;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const clampVolume = audioModule.clampVolume;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const collectRuntimeDiagnostics =
  runtimeModule.collectRuntimeDiagnostics;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createAssetLoaders = assetsModule.createAssetLoaders;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createBrowserSoundAsset = audioModule.createBrowserSoundAsset;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createFontLoader = assetsModule.createFontLoader;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createImageLoader = assetsModule.createImageLoader;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createInputDispatcher = eventsModule.createInputDispatcher;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createLocalStorageAdapter =
  storageModule.createLocalStorageAdapter;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createMusicLoader = assetsModule.createMusicLoader;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createMusicPlayer = audioModule.createMusicPlayer;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createSoundLoader = assetsModule.createSoundLoader;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createStorage = storageModule.createStorage;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const createToneGenerator = toneModule.createToneGenerator;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const dispatchHook = eventsModule.dispatchHook;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const fitTextboxFontSize = renderingModule.fitTextboxFontSize;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const getParameterNames = eventsModule.getParameterNames;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const getScreen = renderingModule.getScreen;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const layoutText = renderingModule.layoutText;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const mapBrowserKeyEvent = eventsModule.mapBrowserKeyEvent;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const mapBrowserMouseButton = eventsModule.mapBrowserMouseButton;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const mapBrowserMouseEvent = eventsModule.mapBrowserMouseEvent;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const mapBrowserWheelEvent = eventsModule.mapBrowserWheelEvent;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const normalizeColor = renderingModule.normalizeColor;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const normalizeWaveform = toneModule.normalizeWaveform;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const noteToFrequency = toneModule.noteToFrequency;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const parseToneFrequency = toneModule.parseToneFrequency;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const setScreen = renderingModule.setScreen;
/** @deprecated Import from `@js-game-zero/core/host` instead. */
export const validateAssetName = assetsModule.validateAssetName;

/** @deprecated Import this type from `@js-game-zero/core/host` instead. */
export type {
  AssetLoaderOptions,
  AudioContextLike,
  AudioElementFactory,
  AudioElementLike,
  AudioParamLike,
  BrowserKeyboardLike,
  BrowserMouseLike,
  BrowserSoundDebugState,
  BrowserSoundOptions,
  BrowserStorageLike,
  BrowserWheelLike,
  GainNodeLike,
  LocalStorageAdapterOptions,
  MappedKeyboardEvent,
  MappedMouseEvent,
  MusicPlayerOptions,
  OscillatorNodeLike,
  StorageOptions,
  TextLayout,
  TimeoutScheduler,
  ToneOptions,
} from "./host";
