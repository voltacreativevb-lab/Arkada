import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../lib/adminAuth.js";
import { transitionStatus } from "../lib/statusTransitions.js";
import { signedUrl } from "../lib/storage.js";
import { supabaseAdmin } from "../lib/supabase.js";

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
