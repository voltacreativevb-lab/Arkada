export type Pismo = "lat" | "cyr";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Derived once per model by parsing the uploaded CorelDRAW SVG export. */
export interface SablonConfig {
  viewBoxW: number;
  viewBoxH: number;
  /** SVG user units per millimeter (derived from the width="...mm" attribute vs viewBox). */
  mmScale: number;
  /** The "zona" rect — the only area inside which customer text may be positioned. */
  zone: Rect;
}

/** One customer-editable text field on a model (derived from <text id="..."> placeholders). */
export interface PoljeDef {
  key: string;
  label: string;
  placeholder: string;
  default_x: number;
  default_y: number;
  max_len: number;
  min_mm: number;
  max_mm: number;
  default_mm: number;
  required: boolean;
}

export interface Pozicija {
  x: number;
  y: number;
  sizePx: number;
}

/** Measures rendered text width in px for a given font at a given pixel size. */
export type MeasureFn = (text: string, fontKey: string, sizePx: number) => number;

export interface FontDef {
  key: string;
  label: string;
  cssStack: string;
  weight: number;
  /** Google Fonts static file name, used by the server-side fontkit measurer. */
  fileName: string;
}
