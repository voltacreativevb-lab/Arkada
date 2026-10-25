import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";

export const izboriRouter = Router();

/** GET /izbori/mesta — svih 37 biračkih mesta, javno (bez prijave). */
izboriRouter.get("/izbori/mesta", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("biracka_mesta")
    .select("broj, upisani, glasalo, sns, student, nevazeci, unet, updated_at")
    .order("broj", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ mesta: data });
});

const unosSchema = z.object({
  upisani: z.number().int().min(0),
  glasalo: z.number().int().min(0),
  sns: z.number().int().min(0),
  student: z.number().int().min(0),
  nevazeci: z.number().int().min(0),
});

/** PUT /izbori/mesta/:broj — upis rezultata za jedno biračko mesto, javno (bez prijave). */
izboriRouter.put("/izbori/mesta/:broj", async (req, res) => {
  const broj = Number(req.params.broj);
  if (!Number.isInteger(broj) || broj < 1 || broj > 37) {
    return res.status(400).json({ error: "Nevažeći broj biračkog mesta" });
  }

  const parsed = unosSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Nevažeći podaci" });
  }

  const { data, error } = await supabaseAdmin
    .from("biracka_mesta")
    .update({ ...parsed.data, unet: true, updated_at: new Date().toISOString() })
    .eq("broj", broj)
    .select("broj, upisani, glasalo, sns, student, nevazeci, unet, updated_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Biračko mesto nije pronađeno" });
  res.json({ mesto: data });
});

/** DELETE /izbori/mesta/:broj — poništi pogrešno unete rezultate za jedno biračko mesto, javno. */
izboriRouter.delete("/izbori/mesta/:broj", async (req, res) => {
  const broj = Number(req.params.broj);
  if (!Number.isInteger(broj) || broj < 1 || broj > 37) {
    return res.status(400).json({ error: "Nevažeći broj biračkog mesta" });
  }

  const { data, error } = await supabaseAdmin
    .from("biracka_mesta")
    .update({ upisani: 0, glasalo: 0, sns: 0, student: 0, nevazeci: 0, unet: false, updated_at: new Date().toISOString() })
    .eq("broj", broj)
    .select("broj, upisani, glasalo, sns, student, nevazeci, unet, updated_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Biračko mesto nije pronađeno" });
  res.json({ mesto: data });
});

/** GET /izbori/stanje — objavljena poruka i da li je uključena "pobeda" animacija, javno. */
izboriRouter.get("/izbori/stanje", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("izbori_stanje")
    .select("poruka, pobeda_prikaz, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ stanje: data ?? { poruka: "", pobeda_prikaz: false, updated_at: null } });
});

const stanjeSchema = z.object({
  poruka: z.string().max(2000).optional(),
  pobeda_prikaz: z.boolean().optional(),
});

/** PUT /izbori/stanje — objavi poruku i/ili uključi/isključi "pobeda" animaciju, javno. */
izboriRouter.put("/izbori/stanje", async (req, res) => {
  const parsed = stanjeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Nevažeći podaci" });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "Nema šta da se sačuva" });
  }

  const { data, error } = await supabaseAdmin
    .from("izbori_stanje")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("poruka, pobeda_prikaz, updated_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Stanje nije pronađeno" });
  res.json({ stanje: data });
});
