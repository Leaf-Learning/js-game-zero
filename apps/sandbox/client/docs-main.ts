import { createDocumentationBrowser } from "./documentation-browser";
import { qs } from "./dom";
import { initThemeToggle } from "./theme";

const themeToggle = qs<HTMLButtonElement>(document, "[data-jgz-theme-toggle]");
initThemeToggle(themeToggle);

const documentationBrowser = createDocumentationBrowser();
void documentationBrowser.load();
