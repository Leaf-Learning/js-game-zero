// Script-tag entry point for js-game-zero (`js-game-zero/iife`).
//
// scripts/build.ts bundles this file in IIFE format to dist/jgz.js, for
// consumers who load the framework with a plain `<script src="jgz.js"></script>`
// instead of an ESM import. Loading it exposes the whole package (identical to
// the ESM `index.ts` entry) as a single `window.JGZ` global, plus the few host
// APIs a page needs to start, drive and read a game it runs: `loadImages`,
// `getGameInspector`, `serializeGameValue`, `parseStatePath` and
// `createSeededRandom`. Games can't see `window`, so these never reach a
// game's own scope.
import {
  createSeededRandom,
  getGameInspector,
  loadImages,
  parseStatePath,
  serializeGameValue,
} from "./host";
import type * as hostApi from "./host";
import * as framework from "./index";

// Typed by name, so the emitted declarations refer to the host entry point.
type Host = Pick<
  typeof hostApi,
  | "createSeededRandom"
  | "getGameInspector"
  | "loadImages"
  | "parseStatePath"
  | "serializeGameValue"
>;

const host: Host = {
  createSeededRandom,
  getGameInspector,
  loadImages,
  parseStatePath,
  serializeGameValue,
};

declare global {
  interface Window {
    JGZ?: typeof framework & typeof host;
  }
}

if (typeof window !== "undefined") {
  window.JGZ = { ...framework, ...host };
}

export * from "./index";
