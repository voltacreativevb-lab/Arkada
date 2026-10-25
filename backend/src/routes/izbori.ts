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

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * POST /izbori/test — popuni sva 37 mesta plauzibilnim demo brojevima i
 * uključi "pobeda" prikaz na tačno 10 sekundi, da operater može da
 * uvežba/proveri TV prikaz pre prave večeri. Gašenje je upisano kao
 * pobeda_until u bazi (GET /izbori/stanje ga sam primenjuje) — ne zavisi
 * od toga da li operaterova stranica ostane otvorena 10s.
 */
izboriRouter.post("/izbori/test", async (_req, res) => {
  const now = new Date();
  const nowIso = now.toISOString();
  const rows = Array.from({ length: 37 }, (_, i) => {
    const broj = i + 1;
    const upisani = randomInt(500, 1200);
    const glasalo = Math.round(upisani * (0.35 + Math.random() * 0.3));
    const nevazeci = Math.round(glasalo * (0.01 + Math.random() * 0.05));
    const valid = glasalo - nevazeci;
    const sns = Math.round(valid * (0.73 + Math.random() * 0.04)); // SNS pobeđuje sa ~75%
    const student = valid - sns;
    return { broj, upisani, glasalo, sns, student, nevazeci, unet: true, updated_at: nowIso };
  });

  const { error: mestaError } = await supabaseAdmin.from("biracka_mesta").upsert(rows);
  if (mestaError) return res.status(500).json({ error: mestaError.message });

  const pobedaUntil = new Date(now.getTime() + 10_000).toISOString();
  const { error: stanjeError } = await supabaseAdmin
    .from("izbori_stanje")
    .update({ poruka: "Ово је тест — демо подаци.", pobeda_prikaz: true, pobeda_until: pobedaUntil, updated_at: nowIso })
    .eq("id", 1);
  if (stanjeError) return res.status(500).json({ error: stanjeError.message });

  res.json({ ok: true });
});

/** POST /izbori/reset-sve — vrati svih 37 mesta i objavljeno stanje na početne (nula/prazno) vrednosti. */
izboriRouter.post("/izbori/reset-sve", async (_req, res) => {
  const now = new Date().toISOString();

  const { error: mestaError } = await supabaseAdmin
    .from("biracka_mesta")
    .update({ upisani: 0, glasalo: 0, sns: 0, student: 0, nevazeci: 0, unet: false, updated_at: now })
    .gte("broj", 1)
    .lte("broj", 37);
  if (mestaError) return res.status(500).json({ error: mestaError.message });

  const { error: stanjeError } = await supabaseAdmin
    .from("izbori_stanje")
    .update({ poruka: "", pobeda_prikaz: false, pobeda_until: null, updated_at: now })
    .eq("id", 1);
  if (stanjeError) return res.status(500).json({ error: stanjeError.message });

  res.json({ ok: true });
});

/**
 * GET /izbori/stanje — objavljena poruka i da li je uključena "pobeda"
 * animacija, javno. Ako je pobeda_prikaz uključen preko /izbori/test i
 * pobeda_until je istekao, ovde se sam gasi (server je jedini izvor
 * istine — ne zavisi od toga da li je operaterova stranica ostala otvorena).
 */
izboriRouter.get("/izbori/stanje", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("izbori_stanje")
    .select("poruka, pobeda_prikaz, pobeda_until, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ stanje: { poruka: "", pobeda_prikaz: false, updated_at: null } });

  if (data.pobeda_prikaz && data.pobeda_until && new Date(data.pobeda_until) <= new Date()) {
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("izbori_stanje")
      .update({ pobeda_prikaz: false, pobeda_until: null, updated_at: nowIso })
      .eq("id", 1);
    data.pobeda_prikaz = false;
    data.updated_at = nowIso;
  }

  res.json({ stanje: { poruka: data.poruka, pobeda_prikaz: data.pobeda_prikaz, updated_at: data.updated_at } });
});

const stanjeSchema = z.object({
  poruka: z.string().max(2000).optional(),
  pobeda_prikaz: z.boolean().optional(),
});

/**
 * PUT /izbori/stanje — objavi poruku i/ili ručno uključi/isključi "pobeda"
 * animaciju, javno. Ručni prekidač je trajan (bez isteka) — briše
 * pobeda_until koji eventualno ostane od poslednjeg /izbori/test pokretanja.
 */
izboriRouter.put("/izbori/stanje", async (req, res) => {
  const parsed = stanjeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Nevažeći podaci" });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "Nema šta da se sačuva" });
  }

  const patch: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
  if (parsed.data.pobeda_prikaz !== undefined) patch.pobeda_until = null;

  const { data, error } = await supabaseAdmin
    .from("izbori_stanje")
    .update(patch)
    .eq("id", 1)
    .select("poruka, pobeda_prikaz, updated_at")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Stanje nije pronađeno" });
  res.json({ stanje: data });
});
