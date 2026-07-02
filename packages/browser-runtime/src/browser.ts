// Script-tag entry point for @js-game-zero/browser-runtime.
//
// scripts/build.ts bundles this file in IIFE format to
// packages/browser-runtime/dist/browser, for consumers who load the
// framework with a plain `<script src="browser.js"></script>` instead of an
// ESM import. Loading it exposes the whole package (identical to the ESM
// `index.ts` entry) as a single `window.JGZ` global.
import * as browserRuntime from "./index";

declare global {
  interface Window {
    JGZ?: typeof browserRuntime;
  }
}

if (typeof window !== "undefined") {
  window.JGZ = browserRuntime;
}

export * from "./index";
