import type { Rect } from "./types.js";

/** X coordinate of a rect's horizontal center — used for the snap-to-center guide. */
export function centerX(rect: Rect): number {
  return rect.x + rect.w / 2;
}

/**
 * Clamps a dragged text position to stay fully inside `zone`, accounting for
 * the text's own width/height so it never overflows the zone's edges. Direct
 * port of the pointermove handler in proba-sablona.html (lines 244-251).
 */
export function clampPosition(
  pos: { x: number; y: number },
  zone: Rect,
  textWidthPx: number,
  fontSizePx: number
): { x: number; y: number } {
  const half = textWidthPx / 2;
  const x = Math.max(zone.x + half, Math.min(zone.x + zone.w - half, pos.x));
  const y = Math.max(zone.y + fontSizePx * 0.75, Math.min(zone.y + zone.h - fontSizePx * 0.2, pos.y));
  return { x, y };
}

/** Whether a position is close enough to the zone's center to snap to it. */
export function shouldSnapToCenter(x: number, zone: Rect, thresholdPx = 350): boolean {
  return Math.abs(x - centerX(zone)) < thresholdPx;
}
