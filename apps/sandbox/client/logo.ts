/**
 * The js-game-zero mark: a ball in flight over a hill, seen through a
 * rounded window. docs/media/logo.svg is the same drawing. At small sizes
 * the stars and the ball's trail are left out and the frame is a little
 * heavier, so it stays crisp.
 */
const SVG_NS = "http://www.w3.org/2000/svg";
let clipSequence = 0;

export type LogoDetail = "full" | "small";

export function logoMark(size: number, detail: LogoDetail): SVGSVGElement {
  clipSequence += 1;
  const clipId = `jgz-logo-window-${clipSequence}`;
  const night = "#2D2235";
  const cream = "#FFFAF3";
  const scenery =
    detail === "full"
      ? `<circle cx="24" cy="20" r="1" fill="${cream}"/>` +
        `<circle cx="39" cy="18" r="1.2" fill="${cream}"/>` +
        `<circle cx="42" cy="27" r="0.8" fill="${cream}"/>` +
        `<ellipse cx="30" cy="58" rx="26" ry="14" fill="#17A99A"/>` +
        `<circle cx="22.5" cy="39" r="1.3" fill="${cream}" opacity="0.5"/>` +
        `<circle cx="27" cy="33" r="1.8" fill="${cream}" opacity="0.75"/>` +
        `<circle cx="34" cy="29" r="4" fill="${cream}"/>`
      : `<ellipse cx="30" cy="58" rx="26" ry="14" fill="#17A99A"/>` +
        `<circle cx="34" cy="29" r="4.5" fill="${cream}"/>`;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("logo-mark");
  svg.innerHTML =
    `<defs><clipPath id="${clipId}"><rect x="16.5" y="11.5" width="31" height="41" rx="15.5"/></clipPath></defs>` +
    `<g clip-path="url(#${clipId})"><rect x="16" y="11" width="32" height="42" fill="${night}"/>${scenery}</g>` +
    `<rect x="13" y="8" width="38" height="48" rx="19" fill="none" stroke="#F46A1F" stroke-width="${detail === "full" ? 8 : 8.5}"/>`;
  return svg;
}

/** Fills every `<span data-jgz-logo="small" data-size="34">` placeholder. */
export function hydrateLogos(root: ParentNode): void {
  for (const slot of root.querySelectorAll<HTMLElement>("[data-jgz-logo]")) {
    const detail = slot.dataset.jgzLogo === "full" ? "full" : "small";
    slot.replaceWith(logoMark(Number(slot.dataset.size ?? 34), detail));
  }
}
