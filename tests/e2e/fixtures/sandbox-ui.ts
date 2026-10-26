// Steps through the sandbox editor's UI that several specs share: making a
// game, switching games, and opening an asset panel.
import { expect, type Page } from "@playwright/test";

/** Waits until the sandbox has loaded its games and shows either the
 * welcome screen or the workspace. */
export async function waitForSandbox(page: Page): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-jgz-ready", "true");
}

/** Shows the "remix an example or start from blank" choice: the welcome
 * screen while there are no games, and the "New game" dialog after. */
export async function openNewProjectChooser(page: Page): Promise<void> {
  await waitForSandbox(page);
  if (await page.locator("[data-jgz-welcome]").isVisible()) return;
  await page.locator("[data-jgz-project-menu-button]").click();
  await page.locator("[data-jgz-new-project]").click();
}

export async function submitDialogName(
  page: Page,
  name: string,
): Promise<void> {
  await page.locator("[data-jgz-dialog-input]").fill(name);
  await page.locator("[data-jgz-dialog-submit]").click();
}

export async function expectCurrentProject(
  page: Page,
  name: string,
): Promise<void> {
  await expect(page.locator("[data-jgz-current-project]")).toHaveText(name);
}

export async function createBlankProject(
  page: Page,
  name: string,
): Promise<void> {
  await openNewProjectChooser(page);
  await page.locator("[data-jgz-choose-blank]").click();
  await submitDialogName(page, name);
  await expectCurrentProject(page, name);
}

export async function cloneExampleProject(
  page: Page,
  slug: string,
  name: string,
): Promise<void> {
  await openNewProjectChooser(page);
  await page.locator("[data-jgz-choose-example]").click();
  await page.locator(`[data-jgz-use-example="${slug}"]`).click();
  await submitDialogName(page, name);
  await expectCurrentProject(page, name);
}

/** Picks a game from the "My game" menu. */
export async function switchProject(
  page: Page,
  name: string,
  options: { readonly delay?: number } = {},
): Promise<void> {
  await page.locator("[data-jgz-project-menu-button]").click(options);
  await page.locator(`[data-jgz-project="${name}"]`).click(options);
}

/** Opens the Images, Sounds, Music or Fonts panel from the left-hand bar. */
export async function openAssetPanel(
  page: Page,
  kind: "images" | "sounds" | "music" | "fonts",
): Promise<void> {
  const button = page.locator(`[data-jgz-rail="${kind}"]`);
  if ((await button.getAttribute("aria-pressed")) !== "true") {
    await button.click();
  }
  await expect(button).toHaveAttribute("aria-pressed", "true");
}
