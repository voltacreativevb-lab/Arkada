import { createHash } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { parseSablonTemplate } from "@maestrovolta/sablon-core";
import { requireAdmin } from "../lib/adminAuth.js";
import { transitionStatus } from "../lib/statusTransitions.js";
import { publicUrl, signedUrl, uploadBuffer, uploadText } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { hashPin } from "../lib/workerAuth.js";

export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

adminRouter.use(requireAdmin);

const STATUSES = [
  "kreirana", "placena", "u_proizvodnji", "poslata_u_prodavnicu",
  "spremna_za_preuzimanje", "preuzeta", "otkazana", "istekla",
] as const;

/** GET /admin/red-za-izradu — the production queue, newest first. */
adminRouter.get("/admin/red-za-izradu", async (req, res) => {
  let query = supabaseAdmin
    .from("porudzbine")
    .select("kod, status, cena, polja, created_at, prodavnice(naziv), modeli(naziv, proizvodi(naziv))")
    .order("created_at", { ascending: false });

  const status = req.query.status;
  if (typeof status === "string" && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  } else {
    query = query.not("status", "in", "(otkazana,istekla)");
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ porudzbine: data });
});

const statusSchema = z.object({ status: z.enum(STATUSES), napomena: z.string().max(500).optional() });

/** POST /admin/porudzbine/:kod/status — manual status transition (any lifecycle step, admin override). */
adminRouter.post("/admin/porudzbine/:kod/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: order, error } = await supabaseAdmin
    .from("porudzbine")
    .select("id")
    .eq("kod", req.params.kod.toUpperCase())
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!order) return res.status(404).json({ error: "Porudžbina nije pronađena" });

  await transitionStatus(order.id, parsed.data.status, "admin", req.adminUserId!, parsed.data.napomena);
  res.json({ ok: true });
});

/** GET /admin/porudzbine/:kod/svg — signed link to the laser-ready production file. */
adminRouter.get("/admin/porudzbine/:kod/svg", async (req, res) => {
  const { data: order, error } = await supabaseAdmin
    .from("porudzbine")
    .select("svg_proizvodnja_path")
    .eq("kod", req.params.kod.toUpperCase())
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!order?.svg_proizvodnja_path) return res.status(404).json({ error: "SVG nije pronađen" });

  const url = await signedUrl("proizvodnja", order.svg_proizvodnja_path);
  res.json({ url });
});

/** GET /admin/obavestenja — the "Za obavestiti" messaging queue (unsent only). */
adminRouter.get("/admin/obavestenja", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("obavestenja")
    .select("id, tip, created_at, porudzbine(kod, telefon_kupca, kanal_obavestavanja, polja, prodavnice(naziv))")
    .eq("poslato", false)
    .order("created_at");

  if (error) return res.status(500).json({ error: error.message });
  res.json({ obavestenja: data });
});

/** POST /admin/obavestenja/:id/poslato — marks a prepared message as sent (manual, after the admin sends it themselves). */
adminRouter.post("/admin/obavestenja/:id/poslato", async (req, res) => {
  const { error } = await supabaseAdmin
    .from("obavestenja")
    .update({ poslato: true, poslato_at: new Date().toISOString() })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Prodavnice (stores)
// ----------------------------------------------------------------------------

/** GET /admin/prodavnice — every store, with worker/order counts for the list view. */
adminRouter.get("/admin/prodavnice", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("prodavnice")
    .select("*, radnici(count), porudzbine(count)")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const prodavnice = (data ?? []).map((p: any) => ({
    ...p,
    radnici: undefined,
    porudzbine: undefined,
    broj_radnika: p.radnici?.[0]?.count ?? 0,
    broj_porudzbina: p.porudzbine?.[0]?.count ?? 0,
  }));

  res.json({ prodavnice });
});

const createProdavnicaSchema = z.object({
  naziv: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug sme sadržati samo mala slova, brojeve i crtice"),
  grad: z.string().min(1).max(80),
  adresa: z.string().max(200).optional(),
  radno_vreme: z.string().max(200).optional(),
  udeo_prodavnice: z.number().min(0).max(1).optional(),
});

/** POST /admin/prodavnice — onboards a new store. */
adminRouter.post("/admin/prodavnice", async (req, res) => {
  const parsed = createProdavnicaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: existing } = await supabaseAdmin.from("prodavnice").select("id").eq("slug", parsed.data.slug).maybeSingle();
  if (existing) return res.status(409).json({ error: "Slug je već zauzet" });

  const { data, error } = await supabaseAdmin.from("prodavnice").insert(parsed.data).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ prodavnica: data });
});

const updateProdavnicaSchema = z
  .object({
    naziv: z.string().min(1).max(120),
    grad: z.string().min(1).max(80),
    adresa: z.string().max(200).nullable(),
    radno_vreme: z.string().max(200).nullable(),
    udeo_prodavnice: z.number().min(0).max(1),
    aktivna: z.boolean(),
  })
  .partial();

/** PATCH /admin/prodavnice/:id — edit store details, margin, or active status. */
adminRouter.patch("/admin/prodavnice/:id", async (req, res) => {
  const parsed = updateProdavnicaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Nema izmena" });

  const { data, error } = await supabaseAdmin.from("prodavnice").update(parsed.data).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ prodavnica: data });
});

/** GET /admin/prodavnice/:id — store detail with its workers. */
adminRouter.get("/admin/prodavnice/:id", async (req, res) => {
  const [{ data: prodavnica, error: prodavnicaError }, { data: radnici, error: radniciError }] = await Promise.all([
    supabaseAdmin.from("prodavnice").select("*").eq("id", req.params.id).maybeSingle(),
    supabaseAdmin
      .from("radnici")
      .select("id, ime, aktivan, last_login_at, created_at")
      .eq("prodavnica_id", req.params.id)
      .order("created_at"),
  ]);

  if (prodavnicaError) return res.status(500).json({ error: prodavnicaError.message });
  if (!prodavnica) return res.status(404).json({ error: "Prodavnica nije pronađena" });
  if (radniciError) return res.status(500).json({ error: radniciError.message });

  res.json({ prodavnica, radnici });
});

// ----------------------------------------------------------------------------
// Radnici (store workers)
// ----------------------------------------------------------------------------

const createRadnikSchema = z.object({
  ime: z.string().min(1).max(80),
  pin: z.string().regex(/^\d{4,8}$/, "PIN mora imati 4-8 cifara"),
});

/** POST /admin/prodavnice/:id/radnici — adds a worker (sets their PIN) to a store. */
adminRouter.post("/admin/prodavnice/:id/radnici", async (req, res) => {
  const parsed = createRadnikSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const pin_hash = await hashPin(parsed.data.pin);
  const { data, error } = await supabaseAdmin
    .from("radnici")
    .insert({ prodavnica_id: req.params.id, ime: parsed.data.ime, pin_hash })
    .select("id, ime, aktivan, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ radnik: data });
});

const updateRadnikSchema = z.object({
  aktivan: z.boolean().optional(),
  pin: z
    .string()
    .regex(/^\d{4,8}$/, "PIN mora imati 4-8 cifara")
    .optional(),
});

/**
 * PATCH /admin/radnici/:id — deactivate/reactivate a worker and/or reset
 * their PIN. Either change bumps token_version so any already-issued
 * tablet session for this worker is invalidated immediately.
 */
adminRouter.patch("/admin/radnici/:id", async (req, res) => {
  const parsed = updateRadnikSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Nema izmena" });

  const { data: current, error: currentError } = await supabaseAdmin
    .from("radnici")
    .select("token_version")
    .eq("id", req.params.id)
    .maybeSingle();
  if (currentError) return res.status(500).json({ error: currentError.message });
  if (!current) return res.status(404).json({ error: "Radnik nije pronađen" });

  const update: Record<string, unknown> = { token_version: current.token_version + 1 };
  if (parsed.data.aktivan !== undefined) update.aktivan = parsed.data.aktivan;
  if (parsed.data.pin) update.pin_hash = await hashPin(parsed.data.pin);

  const { data, error } = await supabaseAdmin
    .from("radnici")
    .update(update)
    .eq("id", req.params.id)
    .select("id, ime, aktivan, created_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ radnik: data });
});

// ----------------------------------------------------------------------------
// Proizvodi i modeli (katalog)
// ----------------------------------------------------------------------------

/** GET /admin/proizvodi — every product (incl. inactive), with model counts. */
adminRouter.get("/admin/proizvodi", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("proizvodi")
    .select("*, modeli(count)")
    .order("sort_order");

  if (error) return res.status(500).json({ error: error.message });

  const proizvodi = (data ?? []).map((p: any) => ({ ...p, modeli: undefined, broj_modela: p.modeli?.[0]?.count ?? 0 }));
  res.json({ proizvodi });
});

const createProizvodSchema = z.object({
  naziv: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Slug sme sadržati samo mala slova, brojeve i crtice"),
  opis: z.string().max(500).optional(),
  osnovna_cena: z.coerce.number().positive(),
});

/** POST /admin/proizvodi — creates a product, optionally with a cover photo ("slika" field). */
adminRouter.post("/admin/proizvodi", upload.single("slika"), async (req, res) => {
  const parsed = createProizvodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { data: existing } = await supabaseAdmin.from("proizvodi").select("id").eq("slug", parsed.data.slug).maybeSingle();
  if (existing) return res.status(409).json({ error: "Slug je već zauzet" });

  let slika_glavna: string | null = null;
  if (req.file) {
    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const path = `${parsed.data.slug}-${Date.now()}.${ext}`;
    try {
      await uploadBuffer("slike", path, req.file.buffer, req.file.mimetype);
      slika_glavna = publicUrl("slike", path);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Greška pri otpremanju slike" });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("proizvodi")
    .insert({ ...parsed.data, slika_glavna })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ proizvod: data });
});

const updateProizvodSchema = z
  .object({
    naziv: z.string().min(1).max(120),
    opis: z.string().max(500).nullable(),
    osnovna_cena: z.coerce.number().positive(),
    aktivan: z.boolean(),
    sort_order: z.coerce.number().int(),
  })
  .partial();

/** PATCH /admin/proizvodi/:id — edit product fields, optionally replacing the cover photo. */
adminRouter.patch("/admin/proizvodi/:id", upload.single("slika"), async (req, res) => {
  const parsed = updateProizvodSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const update: Record<string, unknown> = { ...parsed.data };
  if (req.file) {
    const ext = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
    const path = `${req.params.id}-${Date.now()}.${ext}`;
    try {
      await uploadBuffer("slike", path, req.file.buffer, req.file.mimetype);
      update.slika_glavna = publicUrl("slike", path);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Greška pri otpremanju slike" });
    }
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: "Nema izmena" });

  const { data, error } = await supabaseAdmin.from("proizvodi").update(update).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ proizvod: data });
});

/** GET /admin/proizvodi/:id — product detail with its models. */
adminRouter.get("/admin/proizvodi/:id", async (req, res) => {
  const [{ data: proizvod, error: proizvodError }, { data: modeli, error: modeliError }] = await Promise.all([
    supabaseAdmin.from("proizvodi").select("*").eq("id", req.params.id).maybeSingle(),
    supabaseAdmin.from("modeli").select("*").eq("proizvod_id", req.params.id).order("sort_order"),
  ]);

  if (proizvodError) return res.status(500).json({ error: proizvodError.message });
  if (!proizvod) return res.status(404).json({ error: "Proizvod nije pronađen" });
  if (modeliError) return res.status(500).json({ error: modeliError.message });

  res.json({ proizvod, modeli });
});

/**
 * POST /admin/sabloni/parse — dry-run parse of an uploaded SVG template, no
 * save. Lets the admin review the detected zone/fields before committing to
 * a model (the per-field label/limits still need human judgment — see
 * shared/sablon-core parseSablonTemplate).
 */
adminRouter.post("/admin/sabloni/parse", upload.single("sablon"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fajl (SVG) nije poslat" });
  try {
    const svgText = req.file.buffer.toString("utf8");
    const parsed = parseSablonTemplate(svgText);
    res.json(parsed);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Greška pri parsiranju šablona" });
  }
});

const modelFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1).max(60),
  placeholder: z.string(),
  default_x: z.number(),
  default_y: z.number(),
  max_len: z.coerce.number().int().min(1).max(200),
  min_mm: z.coerce.number().min(1).max(200),
  max_mm: z.coerce.number().min(1).max(200),
  default_mm: z.coerce.number().min(1).max(200),
  required: z.boolean(),
});

const createModelBodySchema = z.object({
  naziv: z.string().min(1).max(80),
  kod: z.string().min(1).max(10),
  cena: z.coerce.number().positive().optional(),
  polja: z.string(),
});

/** POST /admin/proizvodi/:id/modeli — creates a model from a reviewed SVG template + admin-filled field limits. */
adminRouter.post("/admin/proizvodi/:id/modeli", upload.single("sablon"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Šablon (SVG) je obavezan" });

  const parsedBody = createModelBodySchema.safeParse(req.body);
  if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

  let polja;
  try {
    polja = z.array(modelFieldSchema).min(1).parse(JSON.parse(parsedBody.data.polja));
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Neispravan format polja" });
  }

  const svgText = req.file.buffer.toString("utf8");
  let config;
  try {
    config = parseSablonTemplate(svgText).config;
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Greška u šablonu" });
  }

  const sablon_hash = createHash("sha256").update(svgText).digest("hex");
  const sablon_svg_path = `${req.params.id}-${parsedBody.data.kod}-${Date.now()}.svg`;
  try {
    await uploadText("sabloni", sablon_svg_path, svgText);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Greška pri otpremanju šablona" });
  }

  const { data, error } = await supabaseAdmin
    .from("modeli")
    .insert({
      proizvod_id: req.params.id,
      naziv: parsedBody.data.naziv,
      kod: parsedBody.data.kod,
      cena: parsedBody.data.cena ?? null,
      sablon_svg_path,
      sablon_hash,
      sablon_config: config,
      polja,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ model: data });
});

const updateModelSchema = z
  .object({
    naziv: z.string().min(1).max(80),
    cena: z.coerce.number().positive().nullable(),
    aktivan: z.boolean(),
  })
  .partial();

/** PATCH /admin/modeli/:id — edit a model's name/price/active status. */
adminRouter.patch("/admin/modeli/:id", async (req, res) => {
  const parsed = updateModelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Nema izmena" });

  const { data, error } = await supabaseAdmin.from("modeli").update(parsed.data).eq("id", req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ model: data });
});

// ----------------------------------------------------------------------------
// Finansije (revenue, per-store payout split, CSV export)
// "Realized" revenue = any order that was actually paid for at the register —
// every status except kreirana (unpaid), otkazana, istekla.
// ----------------------------------------------------------------------------

const PAID_STATUSES = "(kreirana,otkazana,istekla)"; // excluded set, used with .not("status","in",...)

const financeQuerySchema = z.object({ od: z.string().optional(), do: z.string().optional() });

function resolveRange(od?: string, doParam?: string) {
  const now = new Date();
  const from = od ? new Date(`${od}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const to = doParam ? new Date(`${doParam}T23:59:59.999Z`) : now;
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** GET /admin/finansije?od=YYYY-MM-DD&do=YYYY-MM-DD — revenue + per-store/per-product breakdown. Defaults to the last 30 days. */
adminRouter.get("/admin/finansije", async (req, res) => {
  const parsed = financeQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fromIso, toIso } = resolveRange(parsed.data.od, parsed.data.do);

  const { data: orders, error } = await supabaseAdmin
    .from("porudzbine")
    .select("cena, created_at, prodavnica_id, prodavnice(naziv, udeo_prodavnice), modeli(naziv, proizvod_id, proizvodi(naziv))")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .not("status", "in", PAID_STATUSES);

  if (error) return res.status(500).json({ error: error.message });

  let prihod = 0;
  const poDanu = new Map<string, { prihod: number; broj: number }>();
  const poProdavnici = new Map<string, { naziv: string; udeo: number; prihod: number; broj: number }>();
  const poProizvodu = new Map<string, { naziv: string; prihod: number; broj: number }>();

  for (const o of orders ?? []) {
    const cena = Number(o.cena);
    prihod += cena;

    const dan = String(o.created_at).slice(0, 10);
    const d = poDanu.get(dan) ?? { prihod: 0, broj: 0 };
    d.prihod += cena;
    d.broj += 1;
    poDanu.set(dan, d);

    const prodavnica = o.prodavnice as unknown as { naziv: string; udeo_prodavnice: number } | null;
    if (prodavnica) {
      const p = poProdavnici.get(o.prodavnica_id) ?? { naziv: prodavnica.naziv, udeo: Number(prodavnica.udeo_prodavnice), prihod: 0, broj: 0 };
      p.prihod += cena;
      p.broj += 1;
      poProdavnici.set(o.prodavnica_id, p);
    }

    const model = o.modeli as unknown as { proizvod_id: string; proizvodi: { naziv: string } } | null;
    if (model?.proizvodi) {
      const pr = poProizvodu.get(model.proizvod_id) ?? { naziv: model.proizvodi.naziv, prihod: 0, broj: 0 };
      pr.prihod += cena;
      pr.broj += 1;
      poProizvodu.set(model.proizvod_id, pr);
    }
  }

  res.json({
    period: { od: fromIso.slice(0, 10), do: toIso.slice(0, 10) },
    ukupno: { broj_porudzbina: orders?.length ?? 0, prihod },
    po_danu: [...poDanu.entries()].map(([datum, v]) => ({ datum, ...v })).sort((a, b) => a.datum.localeCompare(b.datum)),
    po_prodavnici: [...poProdavnici.entries()]
      .map(([id, v]) => ({
        prodavnica_id: id,
        naziv: v.naziv,
        udeo_prodavnice: v.udeo,
        broj_porudzbina: v.broj,
        prihod: v.prihod,
        zarada_prodavnice: Math.round(v.prihod * v.udeo),
        zarada_platforme: Math.round(v.prihod * (1 - v.udeo)),
      }))
      .sort((a, b) => b.prihod - a.prihod),
    po_proizvodu: [...poProizvodu.entries()]
      .map(([id, v]) => ({ proizvod_id: id, naziv: v.naziv, broj_porudzbina: v.broj, prihod: v.prihod }))
      .sort((a, b) => b.prihod - a.prihod),
  });
});

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /admin/finansije/izvoz — same range, as a line-item CSV for bookkeeping. */
adminRouter.get("/admin/finansije/izvoz", async (req, res) => {
  const parsed = financeQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fromIso, toIso } = resolveRange(parsed.data.od, parsed.data.do);

  const { data: orders, error } = await supabaseAdmin
    .from("porudzbine")
    .select("kod, cena, status, created_at, prodavnice(naziv, udeo_prodavnice), modeli(naziv, proizvodi(naziv))")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .not("status", "in", PAID_STATUSES)
    .order("created_at");

  if (error) return res.status(500).json({ error: error.message });

  const header = "Kod,Datum,Prodavnica,Udeo prodavnice,Proizvod,Model,Cena,Zarada prodavnice,Zarada platforme,Status\n";
  const rows = (orders ?? [])
    .map((o: any) => {
      const udeo = Number(o.prodavnice?.udeo_prodavnice ?? 0);
      const cena = Number(o.cena);
      return [
        o.kod,
        String(o.created_at).slice(0, 10),
        o.prodavnice?.naziv ?? "",
        udeo,
        o.modeli?.proizvodi?.naziv ?? "",
        o.modeli?.naziv ?? "",
        cena,
        Math.round(cena * udeo),
        Math.round(cena * (1 - udeo)),
        o.status,
      ]
        .map(csvCell)
        .join(",");
    })
    .join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="obracun-${fromIso.slice(0, 10)}-${toIso.slice(0, 10)}.csv"`);
  res.send(`﻿${header}${rows}`);
});
