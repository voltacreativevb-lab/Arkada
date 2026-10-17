import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { supabaseAdmin } from "./supabase.js";

const secretKey = () => new TextEncoder().encode(process.env.WORKER_JWT_SECRET!);

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const TOKEN_TTL = "12h";

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

interface WorkerTokenPayload {
  radnikId: string;
  prodavnicaId: string;
  tokenVersion: number;
}

async function signWorkerToken(payload: WorkerTokenPayload): Promise<string> {
  return new SignJWT({ ...payload, role: "radnik" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

type LoginResult =
  | { ok: true; token: string; radnik: { id: string; ime: string }; prodavnica: { id: string; naziv: string } }
  | { ok: false; error: string };

/**
 * Verifies a (prodavnica slug, PIN) pair against that store's active workers.
 * Lockout is tracked per STORE, not per worker — the PIN alone doesn't tell
 * us which worker is attempting until it matches one, so the shared tablet
 * is the actual brute-force surface to rate-limit.
 */
export async function loginWithPin(slug: string, pin: string): Promise<LoginResult> {
  const { data: prodavnica, error: prodavnicaError } = await supabaseAdmin
    .from("prodavnice")
    .select("id, naziv, aktivna, failed_pin_attempts, locked_until")
    .eq("slug", slug)
    .maybeSingle();

  if (prodavnicaError) throw new Error(prodavnicaError.message);
  if (!prodavnica || !prodavnica.aktivna) return { ok: false, error: "Prodavnica nije pronađena" };

  if (prodavnica.locked_until && new Date(prodavnica.locked_until) > new Date()) {
    return { ok: false, error: "Previše pogrešnih pokušaja — pokušajte ponovo za nekoliko minuta" };
  }

  const { data: radnici, error: radniciError } = await supabaseAdmin
    .from("radnici")
    .select("id, ime, pin_hash, aktivan, token_version")
    .eq("prodavnica_id", prodavnica.id)
    .eq("aktivan", true);

  if (radniciError) throw new Error(radniciError.message);

  let matched: { id: string; ime: string; token_version: number } | undefined;
  for (const r of radnici ?? []) {
    if (await bcrypt.compare(pin, r.pin_hash)) {
      matched = r;
      break;
    }
  }

  if (!matched) {
    const attempts = (prodavnica.failed_pin_attempts ?? 0) + 1;
    const lockout = attempts >= MAX_ATTEMPTS;
    await supabaseAdmin
      .from("prodavnice")
      .update({
        failed_pin_attempts: lockout ? 0 : attempts,
        locked_until: lockout ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", prodavnica.id);
    return { ok: false, error: "Pogrešan PIN" };
  }

  await supabaseAdmin.from("prodavnice").update({ failed_pin_attempts: 0, locked_until: null }).eq("id", prodavnica.id);
  await supabaseAdmin.from("radnici").update({ last_login_at: new Date().toISOString() }).eq("id", matched.id);

  const token = await signWorkerToken({
    radnikId: matched.id,
    prodavnicaId: prodavnica.id,
    tokenVersion: matched.token_version,
  });

  return {
    ok: true,
    token,
    radnik: { id: matched.id, ime: matched.ime },
    prodavnica: { id: prodavnica.id, naziv: prodavnica.naziv },
  };
}

/** Verifies the worker's JWT, then re-checks aktivan/token_version against the DB (instant revocation on deactivate). */
export async function requireWorkerAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const { payload } = await jwtVerify(token, secretKey());
    const radnikId = payload.radnikId as string;
    const tokenVersion = payload.tokenVersion as number;

    const { data: radnik, error } = await supabaseAdmin
      .from("radnici")
      .select("id, prodavnica_id, ime, aktivan, token_version")
      .eq("id", radnikId)
      .maybeSingle();

    if (error || !radnik || !radnik.aktivan || radnik.token_version !== tokenVersion) {
      return res.status(401).json({ error: "Sesija je istekla ili je nalog deaktiviran" });
    }

    req.radnik = { id: radnik.id, prodavnicaId: radnik.prodavnica_id, ime: radnik.ime };
    next();
  } catch {
    return res.status(401).json({ error: "Nevažeća sesija" });
  }
}
