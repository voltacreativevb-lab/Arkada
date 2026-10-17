import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../lib/adminAuth.js";
import { transitionStatus } from "../lib/statusTransitions.js";
import { signedUrl } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { hashPin } from "../lib/workerAuth.js";

export const adminRouter = Router();

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
