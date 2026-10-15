// Script-tag entry point for @js-game-zero/browser-runtime.
//
// scripts/build.ts bundles this file in IIFE format to
// packages/browser-runtime/dist/browser, for consumers who load the
// framework with a plain `<script src="browser.js"></script>` instead of an
// ESM import. Loading it exposes the whole package (identical to the ESM
// `index.ts` entry) as a single `window.JGZ` global, plus the few host APIs a
// page needs to drive and read a game it runs: `getGameInspector`,
// `serializeGameValue`, `parseStatePath` and `createSeededRandom`. Games
// can't see `window`, so these never reach a game's own scope.
import {
  createSeededRandom,
  getGameInspector,
  parseStatePath,
  serializeGameValue,
} from "@js-game-zero/core/host";
import type * as hostApi from "@js-game-zero/core/host";
import * as browserRuntime from "./index";

// Typed by name, so the emitted declarations refer to the host entry point.
type Host = Pick<
  typeof hostApi,
  | "createSeededRandom"
  | "getGameInspector"
  | "parseStatePath"
  | "serializeGameValue"
>;

const host: Host = {
  createSeededRandom,
  getGameInspector,
  parseStatePath,
  serializeGameValue,
};

declare global {
  interface Window {
    JGZ?: typeof browserRuntime & typeof host;
  }
}

if (typeof window !== "undefined") {
  window.JGZ = { ...browserRuntime, ...host };
}

export * from "./index";
