import type { RuntimeDiagnostic } from "./runtime-contracts";

/** The highest density the device's pixel ratio picks by itself. */
export const MAX_AUTO_PIXEL_DENSITY = 3;

/**
 * The most pixels a canvas may hold. iOS Safari leaves a bigger canvas
 * blank, so density comes down until the canvas fits.
 */
export const MAX_CANVAS_PIXELS = 4096 * 4096;

type DensityCanvas = {
  readonly ownerDocument?: { readonly defaultView?: Window | null } | null;
};

/** The device's pixel ratio where the canvas is shown, or 1 outside a browser. */
export function devicePixelRatioOf(canvas: DensityCanvas): number {
  const ratio =
    canvas.ownerDocument?.defaultView?.devicePixelRatio ??
    (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio;
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0
    ? ratio
    : 1;
}

/**
 * Canvas pixels per logical pixel. With no `PIXEL_DENSITY`, it's the
 * device's pixel ratio, between 1 and `MAX_AUTO_PIXEL_DENSITY`. Any density
 * comes down so the canvas stays within `MAX_CANVAS_PIXELS`, but never below
 * 1 unless the game asked for less.
 */
export function resolvePixelDensity(
  value: unknown,
  width: number,
  height: number,
  deviceRatio: number,
  emit: (diagnostic: RuntimeDiagnostic) => void,
): number {
  const fits = Math.max(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
  const auto = Math.max(1, Math.min(deviceRatio, MAX_AUTO_PIXEL_DENSITY, fits));
  if (value === undefined) return auto;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    emit({
      code: "invalid-config",
      severity: "warning",
      name: "PIXEL_DENSITY",
      message:
        "PIXEL_DENSITY should be a positive number, like 1 or 2; using the screen's own density.",
    });
    return auto;
  }
  if (value <= fits) return value;
  emit({
    code: "invalid-config",
    severity: "warning",
    name: "PIXEL_DENSITY",
    message: `PIXEL_DENSITY ${value} makes a ${width} × ${height} game too big a canvas for phones to show; using ${Math.floor(fits * 100) / 100}.`,
  });
  return fits;
}
