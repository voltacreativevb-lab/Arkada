import type { CutShape } from "@maestrovolta/sablon-core";

const NS = "http://www.w3.org/2000/svg";

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function parseFragment(raw: string): Element {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${raw}</svg>`, "image/svg+xml");
  return doc.documentElement.firstElementChild!.cloneNode(true) as Element;
}

/**
 * Renders a natural wood-grain plate clipped to the template's own cut
 * geometry (the largest red shape = the plate boundary, any smaller ones =
 * holes to punch out) and inserts it behind the template's content. Purely
 * decorative — reads shape data from the real template file, so it works
 * for any product's export, not just the oak plate.
 */
export function renderWoodLayer(svg: SVGSVGElement, shapes: CutShape[]): void {
  if (shapes.length === 0) return;

  const sorted = [...shapes].sort((a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h);
  const boundary = sorted[0];
  const holes = sorted.slice(1);
  const rect = boundary.bbox;
  const uid = Math.random().toString(36).slice(2, 8);

  const defs = document.createElementNS(NS, "defs");

  const gradient = document.createElementNS(NS, "linearGradient");
  gradient.setAttribute("id", `wood-grad-${uid}`);
  gradient.setAttribute("x1", "0");
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("x2", "1");
  gradient.setAttribute("y2", "0.18");
  for (const [offset, color] of [
    ["0", "#C69A62"],
    ["0.3", "#D4AA70"],
    ["0.55", "#BF8F55"],
    ["0.8", "#D1A56B"],
    ["1", "#B98A50"],
  ]) {
    const stop = document.createElementNS(NS, "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("stop-color", color);
    gradient.appendChild(stop);
  }
  defs.appendChild(gradient);

  const clip = document.createElementNS(NS, "clipPath");
  clip.setAttribute("id", `wood-clip-${uid}`);
  clip.appendChild(parseFragment(boundary.raw));
  defs.appendChild(clip);

  let maskId: string | null = null;
  if (holes.length > 0) {
    const mask = document.createElementNS(NS, "mask");
    maskId = `wood-mask-${uid}`;
    mask.setAttribute("id", maskId);
    const bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", String(rect.x - 2000));
    bg.setAttribute("y", String(rect.y - 2000));
    bg.setAttribute("width", String(rect.w + 4000));
    bg.setAttribute("height", String(rect.h + 4000));
    bg.setAttribute("fill", "white");
    mask.appendChild(bg);
    for (const hole of holes) {
      const el = parseFragment(hole.raw);
      el.setAttribute("fill", "black");
      mask.appendChild(el);
    }
    defs.appendChild(mask);
  }

  const group = document.createElementNS(NS, "g");
  group.setAttribute("clip-path", `url(#wood-clip-${uid})`);
  if (maskId) group.setAttribute("mask", `url(#${maskId})`);

  const base = document.createElementNS(NS, "rect");
  base.setAttribute("x", String(rect.x));
  base.setAttribute("y", String(rect.y));
  base.setAttribute("width", String(rect.w));
  base.setAttribute("height", String(rect.h));
  base.setAttribute("fill", `url(#wood-grad-${uid})`);
  group.appendChild(base);

  const rnd = seededRandom(7);
  for (let i = 0; i < 26; i++) {
    const y = rect.y + ((i + 0.5) * rect.h) / 26 + (rnd() - 0.5) * 300;
    let d = `M${rect.x} ${y.toFixed(0)}`;
    for (let k = 1; k <= 6; k++) {
      const x = rect.x + (k * rect.w) / 6;
      d += ` Q${(x - rect.w / 12).toFixed(0)} ${(y + (rnd() - 0.5) * 520).toFixed(0)} ${x.toFixed(0)} ${(y + (rnd() - 0.5) * 160).toFixed(0)}`;
    }
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", i % 3 === 0 ? "#8E6234" : "#A87843");
    p.setAttribute("stroke-width", String(40 + rnd() * 90));
    p.setAttribute("opacity", (0.18 + rnd() * 0.22).toFixed(2));
    group.appendChild(p);
  }

  svg.insertBefore(group, svg.firstChild);
  svg.insertBefore(defs, svg.firstChild);
}
