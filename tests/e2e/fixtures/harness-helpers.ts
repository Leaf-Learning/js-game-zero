// Shared helpers for the tests/e2e/*.pw.ts Playwright specs. These are the
// one canonical copies of collectors/readbacks/waiters that were previously
// copy-pasted across many specs; every spec imports from here so the behavior
// stays identical and lives in a single place.
import type { Locator, Page } from "@playwright/test";

/**
 * Collects browser console errors and uncaught page errors so a spec can
 * assert they stayed empty. Previously duplicated verbatim in ~7 specs.
 */
export function collectPageErrors(page: Page): {
  errors: string[];
  pageErrors: string[];
} {
  const errors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { errors, pageErrors };
}

/**
 * True when any pixel on the canvas has a non-zero alpha channel, i.e. the
 * canvas actually painted something rather than staying blank. Parameterized
 * by locator so the example canvas and the sandbox preview canvas share one
 * readback (formerly `visibleCanvasIsNonblank` / `visibleExampleCanvasIsNonblank`
 * / `canvasIsNonblank`).
 */
export async function canvasIsNonblank(canvas: Locator): Promise<boolean> {
  return canvas.evaluate((node) => {
    const target = node as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const data = context.getImageData(0, 0, target.width, target.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return true;
    }
    return false;
  });
}

/**
 * Status object the sandbox server injects around every `/examples/<slug>`
 * page (see apps/sandbox/src/server.ts `harnessPrelude`). The examples
 * themselves carry no test hooks; specs observe them through this.
 */
export type ExampleStatus = {
  slug: string;
  mode: string;
  ready: boolean;
  nonblank: boolean;
  frames: number;
  interactions: {
    keyboard: boolean;
    mouse: boolean;
  };
  storage?: Record<string, unknown>;
  errors: string[];
  diagnostics: unknown[];
};

/**
 * Waits until the example harness for `slug` reports ready, then returns the
 * current status. (Formerly `waitForStatus` / `waitForExampleStatus`.)
 */
export async function waitForExampleStatus(
  page: Page,
  slug: string,
  options: { timeout?: number } = {},
): Promise<ExampleStatus> {
  await page.waitForFunction(
    (expectedSlug) => {
      const status = (
        window as typeof window & {
          __jgzExampleStatus?: { slug: string; ready: boolean };
        }
      ).__jgzExampleStatus;
      return status?.slug === expectedSlug && status.ready;
    },
    slug,
    { timeout: options.timeout ?? 8_000 },
  );
  return page.evaluate(
    () =>
      (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
        .__jgzExampleStatus as ExampleStatus,
  );
}
