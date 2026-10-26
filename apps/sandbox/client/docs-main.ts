import { createDocumentationBrowser } from "./documentation-browser";
import { qs } from "./dom";
import { hydrateIcons } from "./icons";
import { hydrateLogos } from "./logo";
import { initThemeToggle } from "./theme";

hydrateIcons(document);
hydrateLogos(document);

const themeToggle = qs<HTMLButtonElement>(document, "[data-jgz-theme-toggle]");
initThemeToggle(themeToggle);

const documentationBrowser = createDocumentationBrowser();
void documentationBrowser.load();
