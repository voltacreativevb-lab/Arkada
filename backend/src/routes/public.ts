import { Router } from "express";
import { z } from "zod";
import { createOrder, OrderValidationError } from "../lib/orders.js";
import { downloadText } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const publicRouter = Router();

/** GET /modeli/:modelId/sablon.svg — raw template SVG for the live Konfigurator preview. */
publicRouter.get("/modeli/:modelId/sablon.svg", async (req, res) => {
  const { data: model, error } = await supabaseAdmin
    .from("modeli")
    .select("sablon_svg_path, aktivan")
    .eq("id", req.params.modelId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!model || !model.aktivan) return res.status(404).json({ error: "Model nije pronađen" });

  try {
    const svg = await downloadText("sabloni", model.sablon_svg_path);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(svg);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Greška pri učitavanju šablona" });
  }
});

/** GET /prodavnice/:slug — store info for the QR-code landing page. */
publicRouter.get("/prodavnice/:slug", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("prodavnice")
    .select("id, naziv, grad, adresa, radno_vreme")
    .eq("slug", req.params.slug)
    .eq("aktivna", true)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Prodavnica nije pronađena" });
  res.json({ prodavnica: data });
});

/** GET /prodavnice/:slug/proizvodi — catalog with models, including the configurator data the client needs. */
publicRouter.get("/prodavnice/:slug/proizvodi", async (req, res) => {
  const { data: prodavnica, error: prodavnicaError } = await supabaseAdmin
    .from("prodavnice")
    .select("id")
    .eq("slug", req.params.slug)
    .eq("aktivna", true)
    .maybeSingle();

  if (prodavnicaError) return res.status(500).json({ error: prodavnicaError.message });
  if (!prodavnica) return res.status(404).json({ error: "Prodavnica nije pronađena" });

  const { data: proizvodi, error } = await supabaseAdmin
    .from("proizvodi")
    .select(
      "id, naziv, slug, opis, osnovna_cena, slika_glavna, sort_order, modeli(id, naziv, kod, cena, sablon_config, polja, slika_pregled, sort_order, aktivan)"
    )
    .eq("aktivan", true)
    .order("sort_order");

  if (error) return res.status(500).json({ error: error.message });

  const withActiveModels = (proizvodi ?? []).map((p) => ({
    ...p,
    modeli: (p.modeli as unknown as Array<{ aktivan: boolean }>).filter((m) => m.aktivan),
  }));

  res.json({ prodavnica_id: prodavnica.id, proizvodi: withActiveModels });
});

const orderFieldSchema = z.object({
  key: z.string(),
  value: z.string().max(200),
  x: z.number().optional(),
  y: z.number().optional(),
  sizeMm: z.number().optional(),
});

const createOrderSchema = z.object({
  prodavnica_slug: z.string(),
  model_id: z.string().uuid(),
  pismo: z.enum(["lat", "cyr"]),
  font: z.string(),
  polja: z.array(orderFieldSchema),
  telefon_kupca: z.string().max(20).optional(),
  kanal_obavestavanja: z.enum(["whatsapp", "viber"]).optional(),
});

/** POST /porudzbine — creates an order; all pricing/position/text-length validation happens server-side. */
publicRouter.post("/porudzbine", async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: prodavnica, error: prodavnicaError } = await supabaseAdmin
    .from("prodavnice")
    .select("id")
    .eq("slug", parsed.data.prodavnica_slug)
    .eq("aktivna", true)
    .maybeSingle();

  if (prodavnicaError) return res.status(500).json({ error: prodavnicaError.message });
  if (!prodavnica) return res.status(404).json({ error: "Prodavnica nije pronađena" });

  try {
    const order = await createOrder({
      prodavnicaId: prodavnica.id,
      modelId: parsed.data.model_id,
      pismo: parsed.data.pismo,
      font: parsed.data.font,
      polja: parsed.data.polja,
      telefonKupca: parsed.data.telefon_kupca,
      kanalObavestavanja: parsed.data.kanal_obavestavanja,
    });
    res.status(201).json({ porudzbina: order });
  } catch (err) {
    if (err instanceof OrderValidationError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err instanceof Error ? err.message : "Greška pri kreiranju porudžbine" });
  }
});

/** GET /porudzbine/:kod — customer order-status lookup by code, no auth (the code itself is the secret). */
publicRouter.get("/porudzbine/:kod", async (req, res) => {
  const { data: order, error } = await supabaseAdmin
    .from("porudzbine")
    .select(
      "id, kod, status, cena, polja, istice_u, created_at, prodavnice(naziv, grad, adresa, radno_vreme), modeli(naziv, proizvodi(naziv))"
    )
    .eq("kod", req.params.kod.toUpperCase())
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!order) return res.status(404).json({ error: "Porudžbina nije pronađena" });

  const { data: istorija, error: istorijaError } = await supabaseAdmin
    .from("istorija_statusa")
    .select("status, created_at")
    .eq("porudzbina_id", order.id)
    .order("created_at");

  if (istorijaError) return res.status(500).json({ error: istorijaError.message });

  const { id: _id, ...orderWithoutId } = order;
  res.json({ porudzbina: orderWithoutId, istorija: istorija ?? [] });
});
