import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import { findFont, type MeasureFn } from "@maestrovolta/sablon-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "..", "assets", "fonts");

const cache = new Map<string, fontkit.Font>();

function loadFont(fileName: string): fontkit.Font {
  let font = cache.get(fileName);
  if (!font) {
    const loaded = fontkit.openSync(path.join(FONTS_DIR, fileName));
    font = "fonts" in loaded ? (loaded.fonts[0] as fontkit.Font) : (loaded as fontkit.Font);
    cache.set(fileName, font);
  }
  return font;
}

/**
 * Server-side authoritative text measurer, backed by the real font files
 * (fontkit) — no DOM/browser needed. Used by fitFontSize on the order-create
 * endpoint so the final production SVG's text sizing never has to trust the
 * client's measurement.
 */
export const measureServerText: MeasureFn = (text, fontKey, sizePx) => {
  const def = findFont(fontKey);
  if (!def) throw new Error(`Nepoznat font: ${fontKey}`);
  const font = loadFont(def.fileName);
  const run = font.layout(text);
  return (run.advanceWidth / font.unitsPerEm) * sizePx;
};
