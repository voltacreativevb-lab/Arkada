import type { FontDef } from "./types.js";

/**
 * The 8 approved personalization fonts (from proba-sablona.html). `fileName`
 * points at the static Google Fonts file the backend bundles for fontkit
 * measurement — see backend/assets/fonts/.
 */
export const FONTS: FontDef[] = [
  { key: "montserrat", label: "Montserrat", cssStack: "'Montserrat', Arial, sans-serif", weight: 600, fileName: "Montserrat-SemiBold.ttf" },
  { key: "oswald", label: "Oswald", cssStack: "'Oswald', 'Arial Narrow', sans-serif", weight: 500, fileName: "Oswald-Medium.ttf" },
  { key: "pt-serif", label: "PT Serif", cssStack: "'PT Serif', Georgia, serif", weight: 700, fileName: "PTSerif-Bold.ttf" },
  { key: "playfair-display", label: "Playfair Display", cssStack: "'Playfair Display', Georgia, serif", weight: 700, fileName: "PlayfairDisplay-Bold.ttf" },
  { key: "comfortaa", label: "Comfortaa", cssStack: "'Comfortaa', Arial, sans-serif", weight: 700, fileName: "Comfortaa-Bold.ttf" },
  { key: "lobster", label: "Lobster", cssStack: "'Lobster', cursive", weight: 400, fileName: "Lobster-Regular.ttf" },
  { key: "marck-script", label: "Marck Script", cssStack: "'Marck Script', cursive", weight: 400, fileName: "MarckScript-Regular.ttf" },
  { key: "arial", label: "Arial", cssStack: "Arial, Helvetica, sans-serif", weight: 400, fileName: "Arial.ttf" },
];

export function findFont(key: string): FontDef | undefined {
  return FONTS.find((f) => f.key === key);
}
