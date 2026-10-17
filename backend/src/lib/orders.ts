import {
  applyFieldsToTemplate,
  clampPosition,
  fitFontSize,
  findFont,
  transliterate,
  type Pismo,
} from "@maestrovolta/sablon-core";
import { measureServerText } from "./measure.js";
import { downloadText, uploadText } from "./storage.js";
import { supabaseAdmin } from "./supabase.js";
import { generateOrderCode } from "./orderCode.js";

export class OrderValidationError extends Error {}

export interface OrderFieldInput {
  key: string;
  value: string;
  x?: number;
  y?: number;
  sizeMm?: number;
}

export interface CreateOrderInput {
  prodavnicaId: string;
  modelId: string;
  pismo: Pismo;
  font: string;
  polja: OrderFieldInput[];
  telefonKupca?: string;
  kanalObavestavanja?: "whatsapp" | "viber";
}

interface PoljeDefRow {
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

interface SablonConfigRow {
  viewBoxW: number;
  viewBoxH: number;
  mmScale: number;
  zone: { x: number; y: number; w: number; h: number };
}

/**
 * Creates a porudžbina. Every customer-supplied number (position, size) and
 * the displayed price are treated as untrusted — this re-derives all of them
 * from the model's DB-stored template config and writes the authoritative
 * production SVG, per the README: "Server ponovo proverava cenu, dužinu
 * teksta i položaj pre upisa porudžbine."
 */
export async function createOrder(input: CreateOrderInput) {
  const { data: model, error: modelError } = await supabaseAdmin
    .from("modeli")
    .select("id, cena, sablon_svg_path, sablon_config, polja, aktivan, proizvodi(naziv, osnovna_cena, aktivan)")
    .eq("id", input.modelId)
    .maybeSingle();

  if (modelError) throw new Error(modelError.message);
  if (!model || !model.aktivan) throw new OrderValidationError("Model nije pronađen");

  const proizvod = model.proizvodi as unknown as { naziv: string; osnovna_cena: number; aktivan: boolean } | null;
  if (!proizvod?.aktivan) throw new OrderValidationError("Proizvod nije dostupan");

  const fontDef = findFont(input.font);
  if (!fontDef) throw new OrderValidationError("Nepoznat font");

  const poljaDefs = model.polja as unknown as PoljeDefRow[];
  const config = model.sablon_config as unknown as SablonConfigRow;

  const byKey = new Map(input.polja.map((p) => [p.key, p]));
  const finalFields: { key: string; value: string; x: number; y: number; sizePx: number }[] = [];
  const storedPolja: Record<string, string> = {};
  const storedPozicije: Record<string, { x: number; y: number; sizePx: number }> = {};

  for (const def of poljaDefs) {
    const incoming = byKey.get(def.key);
    const rawValue = (incoming?.value ?? "").slice(0, def.max_len);
    if (def.required && !rawValue.trim()) {
      throw new OrderValidationError(`Polje "${def.label}" je obavezno`);
    }
    storedPolja[def.key] = rawValue;
    if (!rawValue) continue;

    const value = transliterate(rawValue, input.pismo);
    const requestedMm = Math.min(Math.max(incoming?.sizeMm ?? def.default_mm, def.min_mm), def.max_mm);
    const requestedSizePx = requestedMm * config.mmScale;

    // 3% safety margin under the zone width — guards against fontkit/browser metric drift (see plan risks).
    const fit = fitFontSize(value, fontDef.key, requestedSizePx, config.zone.w * 0.97, measureServerText);

    const requestedPos = { x: incoming?.x ?? def.default_x, y: incoming?.y ?? def.default_y };
    const clamped = clampPosition(requestedPos, config.zone, fit.widthPx, fit.sizePx);

    finalFields.push({ key: def.key, value, x: clamped.x, y: clamped.y, sizePx: fit.sizePx });
    storedPozicije[def.key] = { x: clamped.x, y: clamped.y, sizePx: fit.sizePx };
  }

  const cena = model.cena ?? proizvod.osnovna_cena;

  const templateSvg = await downloadText("sabloni", model.sablon_svg_path as string);
  const productionSvg = applyFieldsToTemplate(templateSvg, finalFields, {
    cssStack: fontDef.cssStack,
    weight: fontDef.weight,
  });

  let kod = generateOrderCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabaseAdmin.from("porudzbine").select("id").eq("kod", kod).maybeSingle();
    if (!existing) break;
    kod = generateOrderCode();
  }

  const svgPath = `${kod}.svg`;
  await uploadText("proizvodnja", svgPath, productionSvg);

  const isticeU = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { data: order, error: orderError } = await supabaseAdmin
    .from("porudzbine")
    .insert({
      kod,
      prodavnica_id: input.prodavnicaId,
      model_id: input.modelId,
      polja: storedPolja,
      pismo: input.pismo,
      font: fontDef.key,
      pozicije: storedPozicije,
      cena,
      telefon_kupca: input.telefonKupca ?? null,
      kanal_obavestavanja: input.kanalObavestavanja ?? null,
      status: "kreirana",
      istice_u: isticeU,
      svg_proizvodnja_path: svgPath,
    })
    .select()
    .single();

  if (orderError) throw new Error(orderError.message);

  await supabaseAdmin.from("istorija_statusa").insert({
    porudzbina_id: order.id,
    status: "kreirana",
    actor_type: "kupac",
  });

  return order;
}
