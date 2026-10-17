import { useEffect, useRef } from "react";
import { boundingBoxOf, parseCutShapes } from "@maestrovolta/sablon-core";
import { renderWoodLayer } from "../lib/materialStage";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Renders a product's real template as a catalog thumbnail — the actual
 * material/shape (wood grain, cut outline), cropped tight and with no
 * personalization text, since this is a generic "what is this product"
 * preview, not a specific example order.
 */
export default function ProductPreview({ modelId, className }: { modelId: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/modeli/${modelId}/sablon.svg`)
      .then((r) => r.text())
      .then((svgText) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svgText;
        const svg = ref.current.querySelector("svg");
        if (!svg) return;

        svg.style.filter = "drop-shadow(0 6px 14px rgba(45, 30, 10, 0.25))";
        try {
          const shapes = parseCutShapes(svgText);
          if (shapes.length > 0) {
            const bbox = boundingBoxOf(shapes);
            const pad = Math.max(bbox.w, bbox.h) * 0.08;
            svg.setAttribute("viewBox", `${bbox.x - pad} ${bbox.y - pad} ${bbox.w + pad * 2} ${bbox.h + pad * 2}`);
          }
          renderWoodLayer(svg, shapes);
        } catch {
          // Decorative only.
        }
        svg.querySelectorAll("text").forEach((t) => t.remove());
        svg.querySelectorAll<SVGElement>(".str0").forEach((el) => {
          el.style.opacity = "0";
        });
      })
      .catch(() => {
        // No template reachable — card just keeps its fallback background.
      });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return <div ref={ref} className={className} />;
}
