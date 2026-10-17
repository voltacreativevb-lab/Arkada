import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { loginWithPin, requireWorkerAuth } from "../lib/workerAuth.js";
import { transitionStatus } from "../lib/statusTransitions.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const radnikRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => `${req.params.slug}:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
});

const loginSchema = z.object({ pin: z.string().min(4).max(8) });

/** POST /prodavnice/:slug/radnik/prijava — PIN-only login, scoped to one store's shared tablet. */
radnikRouter.post("/prodavnice/:slug/radnik/prijava", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await loginWithPin(req.params.slug, parsed.data.pin);
    if (!result.ok) return res.status(401).json({ error: result.error });
    res.json({ token: result.token, radnik: result.radnik, prodavnica: result.prodavnica });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Greška pri prijavi" });
  }
});

/** GET /radnik/porudzbine — this worker's store orders, excluding terminal states irrelevant to the counter. */
radnikRouter.get("/radnik/porudzbine", requireWorkerAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("porudzbine")
    .select("kod, status, cena, polja, telefon_kupca, created_at, modeli(naziv, proizvodi(naziv))")
    .eq("prodavnica_id", req.radnik!.prodavnicaId)
    .in("status", ["kreirana", "placena", "u_proizvodnji", "poslata_u_prodavnicu", "spremna_za_preuzimanje"])
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ porudzbine: data });
});

async function findOwnOrder(prodavnicaId: string, kod: string) {
  const { data, error } = await supabaseAdmin
    .from("porudzbine")
    .select("id, status, prodavnica_id")
    .eq("kod", kod.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.prodavnica_id !== prodavnicaId) return null;
  return data;
}

/** POST /radnik/porudzbine/:kod/naplaceno — confirms payment at the register (kreirana → placena). */
radnikRouter.post("/radnik/porudzbine/:kod/naplaceno", requireWorkerAuth, async (req, res) => {
  const order = await findOwnOrder(req.radnik!.prodavnicaId, req.params.kod);
  if (!order) return res.status(404).json({ error: "Porudžbina nije pronađena u ovoj prodavnici" });
  if (order.status !== "kreirana") return res.status(409).json({ error: `Porudžbina je već u statusu "${order.status}"` });

  await transitionStatus(order.id, "placena", "radnik", req.radnik!.id);
  res.json({ ok: true });
});

/** POST /radnik/porudzbine/:kod/primljeno — package arrived at the store (poslata_u_prodavnicu → spremna_za_preuzimanje). */
radnikRouter.post("/radnik/porudzbine/:kod/primljeno", requireWorkerAuth, async (req, res) => {
  const order = await findOwnOrder(req.radnik!.prodavnicaId, req.params.kod);
  if (!order) return res.status(404).json({ error: "Porudžbina nije pronađena u ovoj prodavnici" });
  if (order.status !== "poslata_u_prodavnicu") {
    return res.status(409).json({ error: `Porudžbina je već u statusu "${order.status}"` });
  }

  await transitionStatus(order.id, "spremna_za_preuzimanje", "radnik", req.radnik!.id);
  res.json({ ok: true });
});

/** POST /radnik/porudzbine/:kod/preuzeto — customer picked it up (spremna_za_preuzimanje → preuzeta). */
radnikRouter.post("/radnik/porudzbine/:kod/preuzeto", requireWorkerAuth, async (req, res) => {
  const order = await findOwnOrder(req.radnik!.prodavnicaId, req.params.kod);
  if (!order) return res.status(404).json({ error: "Porudžbina nije pronađena u ovoj prodavnici" });
  if (order.status !== "spremna_za_preuzimanje") {
    return res.status(409).json({ error: `Porudžbina je već u statusu "${order.status}"` });
  }

  await transitionStatus(order.id, "preuzeta", "radnik", req.radnik!.id);
  res.json({ ok: true });
});
