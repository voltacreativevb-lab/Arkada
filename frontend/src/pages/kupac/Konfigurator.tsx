import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FONTS, clampPosition, fitFontSize, parseCutShapes, transliterate, type Pismo } from "@maestrovolta/sablon-core";
import { createPorudzbina, getKatalog, type Model, type Proizvod } from "../../lib/api";
import { renderWoodLayer } from "../../lib/materialStage";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Pos = { x: number; y: number };

export default function Konfigurator() {
  const { slug, proizvodId } = useParams<{ slug: string; proizvodId: string }>();
  const navigate = useNavigate();

  const [proizvod, setProizvod] = useState<Proizvod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);

  const [pismo, setPismo] = useState<Pismo>("lat");
  const [fontKey, setFontKey] = useState(FONTS[0].key);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sizesMm, setSizesMm] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [telefon, setTelefon] = useState("");
  const [kanal, setKanal] = useState<"whatsapp" | "viber">("whatsapp");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const svgRootRef = useRef<SVGSVGElement | null>(null);
  const textNodes = useRef<Record<string, SVGTextElement>>({});
  const zoneElRef = useRef<SVGElement | null>(null);
  const dragState = useRef<{ key: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!slug) return;
    getKatalog(slug)
      .then((k) => {
        const p = k.proizvodi.find((p) => p.id === proizvodId);
        if (!p) return setError("Proizvod nije pronađen");
        setProizvod(p);
        setModelId(p.modeli[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [slug, proizvodId]);

  const model: Model | undefined = proizvod?.modeli.find((m) => m.id === modelId);

  const resetForModel = (m: Model) => {
    const initValues: Record<string, string> = {};
    const initSizes: Record<string, number> = {};
    const initPos: Record<string, Pos> = {};
    for (const polje of m.polja) {
      initValues[polje.key] = "";
      initSizes[polje.key] = polje.default_mm;
      initPos[polje.key] = { x: polje.default_x, y: polje.default_y };
    }
    setValues(initValues);
    setSizesMm(initSizes);
    setPositions(initPos);
  };

  // Load + inject the raw template SVG whenever the model changes.
  useEffect(() => {
    if (!model || !stageRef.current) return;
    resetForModel(model);

    fetch(`${API_URL}/modeli/${model.id}/sablon.svg`)
      .then((r) => r.text())
      .then((svgText) => {
        if (!stageRef.current) return;
        stageRef.current.innerHTML = svgText;
        const svg = stageRef.current.querySelector("svg");
        svgRootRef.current = svg;
        textNodes.current = {};

        if (svg) {
          svg.style.filter = "drop-shadow(0 14px 28px rgba(45, 30, 10, 0.28))";
          try {
            renderWoodLayer(svg, parseCutShapes(svgText));
          } catch {
            // Decorative only — a product with unexpected geometry just keeps the plain template.
          }

          const zone = svg.querySelector<SVGElement>('[class~="zona"]');
          if (zone) {
            zone.style.display = "none";
            zoneElRef.current = zone;
          }
          // Laser cut lines read as a faint reference under the wood, not a technical drawing.
          svg.querySelectorAll<SVGElement>(".str0").forEach((el) => {
            if (el !== zone) el.style.opacity = "0.3";
          });
        }

        for (const polje of model.polja) {
          const node = svg?.querySelector<SVGTextElement>(`text[id="${polje.key}"]`);
          if (node) {
            node.style.cursor = "grab";
            (node.style as unknown as Record<string, string>).touchAction = "none";
            node.style.userSelect = "none";
            textNodes.current[polje.key] = node;
          }
        }
        wireDrag();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  function wireDrag() {
    const svg = svgRootRef.current;
    if (!svg || !model) return;

    function toSvgPoint(e: PointerEvent): Pos {
      const pt = svg!.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg!.getScreenCTM();
      const transformed = ctm ? pt.matrixTransform(ctm.inverse()) : pt;
      return { x: transformed.x, y: transformed.y };
    }

    for (const polje of model.polja) {
      const node = textNodes.current[polje.key];
      if (!node) continue;

      node.onpointerdown = (e) => {
        e.preventDefault();
        const p = toSvgPoint(e);
        const current = positions[polje.key] ?? { x: polje.default_x, y: polje.default_y };
        dragState.current = { key: polje.key, dx: current.x - p.x, dy: current.y - p.y };
        node.setPointerCapture(e.pointerId);
        node.style.cursor = "grabbing";
        if (zoneElRef.current) zoneElRef.current.style.display = "";
      };

      node.onpointermove = (e) => {
        if (!dragState.current || dragState.current.key !== polje.key) return;
        const p = toSvgPoint(e);
        const x = p.x + dragState.current.dx;
        const y = p.y + dragState.current.dy;
        setPositions((prev) => ({ ...prev, [polje.key]: { x, y } }));
      };

      const end = () => {
        if (dragState.current?.key === polje.key) dragState.current = null;
        node.style.cursor = "grab";
        if (zoneElRef.current) zoneElRef.current.style.display = "none";
      };
      node.onpointerup = end;
      node.onpointercancel = end;
    }
  }

  const fontDef = FONTS.find((f) => f.key === fontKey)!;

  function measureWith(node: SVGTextElement, text: string, sizePx: number): number {
    node.style.fontFamily = fontDef.cssStack;
    node.style.fontWeight = String(fontDef.weight);
    node.style.fontSize = `${sizePx}px`;
    node.textContent = text;
    return node.getComputedTextLength();
  }

  const displayValue = (key: string) => {
    const raw = values[key] ?? "";
    return pismo === "cyr" ? transliterate(raw, "cyr") : raw;
  };

  // Re-render all field nodes whenever inputs change.
  useEffect(() => {
    if (!model || !svgRootRef.current) return;
    const zone = model.sablon_config.zone;
    let anyShrunk = false;

    for (const polje of model.polja) {
      const node = textNodes.current[polje.key];
      if (!node) continue;
      const text = displayValue(polje.key);
      const requestedSizePx = (sizesMm[polje.key] ?? polje.default_mm) * model.sablon_config.mmScale;

      const fit = fitFontSize(text, fontKey, requestedSizePx, zone.w, (t, _k, s) => measureWith(node, t, s));
      if (fit.shrunk) anyShrunk = true;

      const pos = positions[polje.key] ?? { x: polje.default_x, y: polje.default_y };
      const clamped = clampPosition(pos, zone, fit.widthPx, fit.sizePx);

      node.setAttribute("x", clamped.x.toFixed(2));
      node.setAttribute("y", clamped.y.toFixed(2));
      node.style.fontFamily = fontDef.cssStack;
      node.style.fontWeight = String(fontDef.weight);
      node.style.fontSize = `${fit.sizePx.toFixed(1)}px`;
      node.textContent = text;
    }
    setShrunk(anyShrunk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, sizesMm, positions, fontKey, pismo, model?.id]);

  const [shrunk, setShrunk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug || !model) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const polja = model.polja.map((polje) => ({
        key: polje.key,
        value: values[polje.key] ?? "",
        x: positions[polje.key]?.x,
        y: positions[polje.key]?.y,
        sizeMm: sizesMm[polje.key],
      }));
      const { porudzbina } = await createPorudzbina({
        prodavnica_slug: slug,
        model_id: model.id,
        pismo,
        font: fontKey,
        polja,
        telefon_kupca: telefon || undefined,
        kanal_obavestavanja: telefon ? kanal : undefined,
      });
      navigate(`/${slug}/potvrda/${porudzbina.kod}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Greška pri slanju porudžbine");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF0F2] p-6 text-center">
        <p className="text-muted">{error}</p>
      </div>
    );
  }
  if (!proizvod || !model) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF0F2]">
        <p className="text-sm text-muted">Učitavanje…</p>
      </div>
    );
  }

  const cena = model.cena ?? proizvod.osnovna_cena;

  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink">
      <header className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-line">
        <Link to={`/${slug}`} className="flex items-center gap-1.5 px-2 py-3 text-sm font-semibold no-underline text-ink">
          ← Svi proizvodi
        </Link>
      </header>

      <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
        <section className="px-5 pt-5 flex flex-col gap-1">
          <h1 className="font-display font-extrabold text-[28px] tracking-tight m-0">{proizvod.naziv}</h1>
          <span className="text-sm text-muted">{proizvod.opis}</span>
        </section>

        <div
          className="mx-2 sm:mx-5 mt-4 rounded-2xl p-2 sm:p-6 flex flex-col items-center gap-3"
          style={{ background: "radial-gradient(ellipse at 50% 35%, #E6E9EC 0%, #CFD4D9 100%)" }}
        >
          <div ref={stageRef} className="w-full [&>svg]:w-full [&>svg]:h-auto" />
          <p className="m-0 flex items-center gap-1.5 text-[13px] text-[#3F454C] text-center px-2">
            <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v5.5M12 10.5V4a1.5 1.5 0 0 1 3 0v6.5M15 10.5V6a1.5 1.5 0 0 1 3 0v8c0 3.5-2 7-6 7s-6-2-7.5-5L3.4 13a1.3 1.3 0 0 1 2.2-1.4L7 14" />
            </svg>
            Prevucite tekst prstom da ga pomerite po tabli
          </p>
          {shrunk && (
            <p className="m-0 px-3 py-2 rounded-lg bg-warn text-warn-fg text-[13px]">
              Neki red je duži od table, pa je automatski smanjen da stane.
            </p>
          )}
          <span className="text-xs text-[#3F454C]">Pregled uživo · Model {model.kod}</span>
        </div>

        {proizvod.modeli.length > 1 && (
          <section className="px-5 pt-5 flex flex-col gap-2.5">
            <h2 className="m-0 text-[15px] font-semibold">1. Izaberite model</h2>
            <div className="grid grid-cols-3 gap-2">
              {proizvod.modeli.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModelId(m.id)}
                  aria-pressed={m.id === modelId}
                  className={`min-h-[64px] rounded-[10px] bg-white flex flex-col items-center justify-center gap-1 text-sm font-semibold ${
                    m.id === modelId ? "border-2 border-accent" : "border border-line"
                  }`}
                >
                  {m.naziv}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="px-5 pt-5 flex flex-col gap-3.5">
          <h2 className="m-0 text-[15px] font-semibold">Pismo</h2>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#E4E8EC] rounded-xl">
            <button
              type="button"
              onClick={() => setPismo("lat")}
              aria-pressed={pismo === "lat"}
              className={`h-10 rounded-[9px] text-sm font-semibold ${pismo === "lat" ? "bg-white shadow" : "bg-transparent"}`}
            >
              Latinica
            </button>
            <button
              type="button"
              onClick={() => setPismo("cyr")}
              aria-pressed={pismo === "cyr"}
              className={`h-10 rounded-[9px] text-sm font-semibold ${pismo === "cyr" ? "bg-white shadow" : "bg-transparent"}`}
            >
              Ћирилица
            </button>
          </div>

          <h2 className="m-0 text-[15px] font-semibold">Font</h2>
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFontKey(f.key)}
                aria-pressed={f.key === fontKey}
                className={`min-h-14 px-2.5 py-1.5 rounded-[10px] bg-white flex flex-col items-start gap-0 text-left ${
                  f.key === fontKey ? "border-2 border-accent" : "border border-line"
                }`}
              >
                <span className="text-[19px] leading-tight" style={{ fontFamily: f.cssStack, fontWeight: f.weight }}>
                  Aa
                </span>
                <span className="text-[11px] text-muted">{f.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="px-5 pt-6 flex flex-col gap-4">
          <h2 className="m-0 text-[15px] font-semibold">2. Upišite tekst</h2>
          {model.polja.map((polje) => (
            <div key={polje.key} className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <label className="text-sm font-medium">
                  {polje.label}
                  {!polje.required && <span className="text-muted"> (nije obavezno)</span>}
                </label>
                <span className="text-xs text-muted">
                  {(values[polje.key] ?? "").length}/{polje.max_len}
                </span>
              </div>
              <input
                type="text"
                value={values[polje.key] ?? ""}
                maxLength={polje.max_len}
                onChange={(e) => setValues((v) => ({ ...v, [polje.key]: e.target.value }))}
                className="h-12 px-3.5 border border-[#A9B0B8] rounded-[10px] text-base bg-white"
              />
              <div className="flex items-center gap-2.5">
                <label className="text-[13px] text-muted whitespace-nowrap">Veličina slova</label>
                <input
                  type="range"
                  min={polje.min_mm}
                  max={polje.max_mm}
                  value={sizesMm[polje.key] ?? polje.default_mm}
                  onChange={(e) => setSizesMm((s) => ({ ...s, [polje.key]: Number(e.target.value) }))}
                  className="flex-1"
                />
                <output className="text-[13px] tabular-nums min-w-[48px] text-right">
                  {sizesMm[polje.key] ?? polje.default_mm} mm
                </output>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => resetForModel(model)}
            className="h-11 rounded-[10px] border border-accent text-accent bg-transparent text-sm font-semibold"
          >
            Vrati tekst na početni položaj
          </button>
        </section>

        <section className="px-5 pt-6 flex flex-col gap-2">
          <h2 className="m-0 text-[15px] font-semibold">3. Kontakt za obaveštenje</h2>
          <label className="text-sm font-medium">Broj telefona</label>
          <input
            type="tel"
            placeholder="06x xxx xxxx"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            className="h-12 px-3.5 border border-[#A9B0B8] rounded-[10px] text-base bg-white"
          />
          {telefon && (
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setKanal("whatsapp")}
                className={`flex-1 h-10 rounded-lg text-sm font-semibold ${
                  kanal === "whatsapp" ? "bg-good text-white" : "bg-white border border-line"
                }`}
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setKanal("viber")}
                className={`flex-1 h-10 rounded-lg text-sm font-semibold ${
                  kanal === "viber" ? "bg-[#5B3E99] text-white" : "bg-white border border-line"
                }`}
              >
                Viber
              </button>
            </div>
          )}
          <span className="text-xs text-muted">Na ovaj broj ćete dobiti obaveštenje kad je proizvod spreman.</span>
        </section>

        <section className="mx-5 mt-6 mb-8 p-4 bg-white border border-line rounded-xl flex flex-col gap-3.5">
          <div className="flex justify-between items-baseline">
            <span className="text-[15px] font-semibold">Cena</span>
            <span className="font-display font-extrabold text-xl">{cena} din</span>
          </div>
          <div className="flex gap-2.5 items-start">
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-5 h-5 mt-0.5 accent-accent"
            />
            <label htmlFor="agree" className="text-[13px] leading-snug text-[#3F454C]">
              Proverio/la sam tekst. Razumem da se personalizovan proizvod ne može vratiti.
            </label>
          </div>
          {submitError && <p className="text-red-600 text-sm m-0">{submitError}</p>}
          <button
            type="submit"
            disabled={!agreed || submitting}
            className="h-[52px] rounded-xl bg-gold text-ink font-bold text-base disabled:opacity-50 disabled:bg-line"
          >
            {submitting ? "Slanje…" : "Potvrdi porudžbinu"}
          </button>
          <span className="text-xs text-muted text-center">Plaćate na kasi prodavnice, ne na sajtu.</span>
        </section>
      </form>
    </div>
  );
}
