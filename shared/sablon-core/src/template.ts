import type { Rect, SablonConfig } from "./types.js";

export interface ParsedField {
  key: string;
  placeholder: string;
  default_x: number;
  default_y: number;
}

export interface ParsedTemplate {
  config: SablonConfig;
  fields: ParsedField[];
}

function attr(attrs: string, name: string): string | undefined {
  return attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
}

/**
 * Parses a CorelDRAW-exported SVG template (see sabloni/tabla-hrast_sablon.svg)
 * into the zone/field geometry the configurator and production-file builder
 * need. Regex-based rather than a full XML parser: the export format is
 * simple/predictable (flat <rect>/<text> elements) and this keeps the
 * package DOM-free so it also runs unmodified in the browser.
 */
export function parseSablonTemplate(svgText: string): ParsedTemplate {
  const svgTag = svgText.match(/<svg\b[^>]*>/)?.[0] ?? "";
  const viewBoxParts = (attr(svgTag, "viewBox") ?? "0 0 0 0").split(/\s+/).map(Number);
  const viewBoxW = viewBoxParts[2] ?? 0;
  const viewBoxH = viewBoxParts[3] ?? 0;

  const widthMm = parseFloat(attr(svgTag, "width") ?? "0");
  const mmScale = widthMm > 0 ? viewBoxW / widthMm : 100;

  const zoneTag =
    svgText.match(/<rect\b[^>]*\bid="zona"[^>]*\/?>/)?.[0] ??
    svgText.match(/<rect\b[^>]*\bclass="[^"]*\bzona\b[^"]*"[^>]*\/?>/)?.[0];
  if (!zoneTag) {
    throw new Error('Šablon nema <rect id="zona"> — zeleno polje za pomeranje teksta');
  }
  const zone: Rect = {
    x: parseFloat(attr(zoneTag, "x") ?? "0"),
    y: parseFloat(attr(zoneTag, "y") ?? "0"),
    w: parseFloat(attr(zoneTag, "width") ?? "0"),
    h: parseFloat(attr(zoneTag, "height") ?? "0"),
  };

  const fields: ParsedField[] = [];
  const textRe = /<text\b([^>]*)>([^<]*)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(svgText))) {
    const [, attrs, content] = m;
    const key = attr(attrs, "id");
    if (!key) continue;
    fields.push({
      key,
      placeholder: content.trim(),
      default_x: parseFloat(attr(attrs, "x") ?? "0"),
      default_y: parseFloat(attr(attrs, "y") ?? "0"),
    });
  }
  if (fields.length === 0) {
    throw new Error('Šablon nema nijedno <text id="..."> polje za personalizaciju');
  }

  return { config: { viewBoxW, viewBoxH, mmScale, zone }, fields };
}

export interface FieldApplication {
  key: string;
  value: string;
  x: number;
  y: number;
  sizePx: number;
}

function setAttr(attrs: string, name: string, value: string): string {
  const re = new RegExp(`${name}="[^"]*"`);
  return re.test(attrs) ? attrs.replace(re, `${name}="${value}"`) : `${attrs} ${name}="${value}"`;
}

function setStyle(attrs: string, decl: string): string {
  const styleRe = /style="([^"]*)"/;
  if (styleRe.test(attrs)) {
    return attrs.replace(styleRe, (_m, existing: string) => {
      const cleaned = existing.replace(/font-size:[^;]+;?|font-family:[^;]+;?|font-weight:[^;]+;?/g, "").trim();
      return `style="${cleaned ? cleaned + ";" : ""}${decl}"`;
    });
  }
  return `${attrs} style="${decl}"`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Produces the final laser-ready SVG: swaps each <text id="key"> placeholder's
 * content/position/size for the customer's computed values, and strips the
 * green "zona" guide rect — per README it must never reach the laser file
 * ("zelena... izbacuje se iz fajla za laser"). Used identically by the order
 * endpoint (authoritative, server-measured) and can be reused for any
 * server-side re-render of an existing order.
 */
export function applyFieldsToTemplate(
  svgText: string,
  fields: FieldApplication[],
  font: { cssStack: string; weight: number }
): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));

  let out = svgText.replace(/<rect\b[^>]*\bid="zona"[^>]*\/?>\s*/i, "");

  out = out.replace(/<text\b([^>]*)>([^<]*)<\/text>/g, (full: string, attrs: string) => {
    const key = attr(attrs, "id");
    const f = key ? byKey.get(key) : undefined;
    if (!f) return full;
    let newAttrs = setAttr(attrs, "x", f.x.toFixed(2));
    newAttrs = setAttr(newAttrs, "y", f.y.toFixed(2));
    newAttrs = setStyle(newAttrs, `font-size:${f.sizePx.toFixed(2)}px;font-family:${font.cssStack};font-weight:${font.weight}`);
    return `<text${newAttrs}>${escapeXml(f.value)}</text>`;
  });

  return out;
}
