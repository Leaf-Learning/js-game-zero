import { expect, test, type Page } from "@playwright/test";
import { exampleManifest } from "../../examples/manifest";

type ExampleStatus = {
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
  x?: number;
  errors: string[];
  diagnostics: unknown[];
};

function collectPageErrors(page: Page): {
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

async function waitForStatus(page: Page, slug: string): Promise<ExampleStatus> {
  await page.waitForFunction(
    (expectedSlug) => {
      const status = (
        window as typeof window & { __jgzExampleStatus?: ExampleStatus }
      ).__jgzExampleStatus;
      return status?.slug === expectedSlug && status.ready;
    },
    slug,
    { timeout: 8_000 },
  );
  return page.evaluate(
    () =>
      (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
        .__jgzExampleStatus as ExampleStatus,
  );
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function visibleExampleCanvasIsNonblank(page: Page): Promise<boolean> {
  return page.locator("[data-jgz-example-canvas]").evaluate((canvas) => {
    const target = canvas as HTMLCanvasElement;
    const context = target.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const data = context.getImageData(0, 0, target.width, target.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) return true;
    }
    return false;
  });
}

test("phase 5 examples index links every shipped example", async ({ page }) => {
  const { errors, pageErrors } = collectPageErrors(page);
  await page.goto("/examples");
  await expect(page).toHaveTitle("js-game-zero Examples");

  for (const example of exampleManifest) {
    await expect(
      page.locator(`[data-jgz-example-link="${example.slug}"]`),
    ).toHaveAttribute("href", `/examples/${example.slug}`);
  }

  expect(errors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

for (const example of exampleManifest) {
  test(`phase 5 example ${example.slug} is browser-playable`, async ({
    page,
  }) => {
    const { errors, pageErrors } = collectPageErrors(page);
    await page.goto(`/examples/${example.slug}`);
    await expect(page).toHaveTitle(example.title);

    const initial = await waitForStatus(page, example.slug);
    expect(initial.mode).toBe(example.mode);
    expect(initial.nonblank).toBe(true);
    expect(await visibleExampleCanvasIsNonblank(page)).toBe(true);
    expect(initial.frames).toBeGreaterThan(0);
    expect(initial.errors).toEqual([]);
    expect(initial.diagnostics).toEqual([]);

    if (example.slug === "drawing-basics") {
      expect(initial.storage?.drawn).toBe(true);
    }
    if (example.slug === "storage-save") {
      expect(initial.storage?.drawn).toBe(true);
      expect(numeric(initial.storage?.score)).toBeGreaterThan(0);
    }
    if (example.slug === "animation-basics") {
      await page.waitForFunction(
        () =>
          (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
            .__jgzExampleStatus?.storage?.animated === true,
      );
      const animated = await waitForStatus(page, example.slug);
      expect(numeric(animated.storage?.x)).toBeGreaterThan(80);
    }

    const canvas = page.locator("[data-jgz-example-canvas]");
    if (example.expectsInput === "keyboard") {
      const before = numeric(initial.storage?.x ?? initial.x);
      await canvas.click();
      await page.keyboard.down("ArrowRight");
      try {
        await page.waitForFunction((previous) => {
          const status = (
            window as typeof window & { __jgzExampleStatus?: ExampleStatus }
          ).__jgzExampleStatus;
          const value = status?.storage?.x ?? status?.x;
          return (
            status?.interactions.keyboard &&
            typeof value === "number" &&
            value > previous
          );
        }, before);
      } finally {
        await page.keyboard.up("ArrowRight");
      }
      const moved = await waitForStatus(page, example.slug);
      const after = numeric(moved.storage?.x ?? moved.x);
      expect(after).toBeGreaterThan(before);
      if (example.slug === "actor-movement") {
        await page.waitForFunction(
          () =>
            (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
              .__jgzExampleStatus?.storage?.spriteReady === true,
        );
        const actorStatus = await waitForStatus(page, example.slug);
        expect(actorStatus.storage?.spriteSize).toEqual([36, 28]);
      }
    }

    if (example.expectsInput === "mouse") {
      await canvas.click({ position: { x: 160, y: 82 } });
      await page.waitForFunction(
        () =>
          (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
            .__jgzExampleStatus?.interactions.mouse,
      );
      await page.waitForFunction(
        () =>
          (window as typeof window & { __jgzExampleStatus?: ExampleStatus })
            .__jgzExampleStatus?.storage?.clicks === 1,
      );
      if (example.slug === "sound-tone") {
        const clicked = await waitForStatus(page, example.slug);
        expect(clicked.storage?.soundPropertyAccess).toBe(true);
      }
    }

    const finalStatus = await waitForStatus(page, example.slug);
    expect(finalStatus.errors).toEqual([]);
    expect(finalStatus.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
