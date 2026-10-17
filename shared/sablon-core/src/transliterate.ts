import type { Pismo } from "./types.js";

/** Two-letter digraphs, longest-match-first (checked before single chars). */
const DIGRAPHS: Record<string, string> = {
  lj: "љ", Lj: "Љ", LJ: "Љ",
  nj: "њ", Nj: "Њ", NJ: "Њ",
  "dž": "џ", "Dž": "Џ", "DŽ": "Џ",
};

const SINGLE: Record<string, string> = {
  a: "а", b: "б", c: "ц", "č": "ч", "ć": "ћ", d: "д", "đ": "ђ", e: "е",
  f: "ф", g: "г", h: "х", i: "и", j: "ј", k: "к", l: "л", m: "м", n: "н",
  o: "о", p: "п", r: "р", s: "с", "š": "ш", t: "т", u: "у", v: "в", z: "з", "ž": "ж",
};

/**
 * Transliterates Latin Serbian text to Cyrillic. Direct port of the DIG/ONE
 * maps in proba-sablona.html (lines 154-166) — customer always types Latin,
 * the site converts for the 'cyr' script choice.
 */
export function transliterate(text: string, pismo: Pismo): string {
  if (pismo === "lat") return text;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const two = text.substring(i, i + 2);
    if (DIGRAPHS[two]) {
      out += DIGRAPHS[two];
      i++;
      continue;
    }
    const ch = text[i];
    const low = ch.toLowerCase();
    if (SINGLE[low]) out += ch === low ? SINGLE[low] : SINGLE[low].toUpperCase();
    else out += ch;
  }
  return out;
}
