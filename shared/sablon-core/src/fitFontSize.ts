import type { MeasureFn } from "./types.js";

export interface FitResult {
  sizePx: number;
  shrunk: boolean;
  widthPx: number;
}

/**
 * Shrinks `requestedSizePx` proportionally if the text would overflow
 * `maxWidthPx`, so a long line never exceeds the zone's width. Direct port
 * of the shrink step in proba-sablona.html (line 302) — scales linearly
 * rather than re-measuring at the smaller size, matching the prototype.
 */
export function fitFontSize(
  text: string,
  fontKey: string,
  requestedSizePx: number,
  maxWidthPx: number,
  measure: MeasureFn
): FitResult {
  const widthPx = text ? measure(text, fontKey, requestedSizePx) : 0;
  if (widthPx > maxWidthPx) {
    const sizePx = (requestedSizePx * maxWidthPx) / widthPx;
    return { sizePx, shrunk: true, widthPx: maxWidthPx };
  }
  return { sizePx: requestedSizePx, shrunk: false, widthPx };
}
