import type { MeasureFn } from "./types.js";

/** Vertical spacing between wrapped lines, as a multiple of font size. */
export const LINE_HEIGHT_RATIO = 1.3;

/**
 * Greedy word-wrap: breaks `text` into lines that each fit within
 * `maxWidthPx` at `sizePx`. A single word longer than the width is kept on
 * its own line rather than broken mid-word.
 */
export function wrapText(text: string, fontKey: string, sizePx: number, maxWidthPx: number, measure: MeasureFn): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, fontKey, sizePx) <= maxWidthPx || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface MultilineFit {
  lines: string[];
  sizePx: number;
}

/**
 * Wraps `text` to fit within `maxWidthPx`, shrinking the font if the
 * resulting block would be taller than `maxHeightPx` (re-wrapping once at
 * the smaller size, since a smaller font usually also means fewer lines).
 */
export function fitMultilineText(
  text: string,
  fontKey: string,
  requestedSizePx: number,
  maxWidthPx: number,
  maxHeightPx: number,
  measure: MeasureFn
): MultilineFit {
  let sizePx = requestedSizePx;
  let lines = wrapText(text, fontKey, sizePx, maxWidthPx, measure);

  const blockHeight = () => lines.length * sizePx * LINE_HEIGHT_RATIO;

  if (blockHeight() > maxHeightPx && maxHeightPx > 0) {
    const scale = maxHeightPx / blockHeight();
    sizePx = sizePx * scale;
    lines = wrapText(text, fontKey, sizePx, maxWidthPx, measure);

    // Re-wrapping at a smaller size can still overflow a hair on short texts
    // with few long words — one more corrective pass covers that case.
    if (blockHeight() > maxHeightPx && maxHeightPx > 0) {
      const scale2 = maxHeightPx / blockHeight();
      sizePx = sizePx * scale2;
      lines = wrapText(text, fontKey, sizePx, maxWidthPx, measure);
    }
  }

  return { lines, sizePx };
}
