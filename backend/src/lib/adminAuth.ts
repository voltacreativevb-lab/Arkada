import type { NextFunction, Request, Response } from "express";
import { decodeJwt } from "jose";
import { supabaseAdmin } from "./supabase.js";

/**
 * Verifies the admin's Supabase Auth session AND that it was issued at
 * aal2 (password + TOTP MFA both completed) — an aal1 session (password
 * only, MFA not yet entered) is rejected. This is the "dvostepena prijava"
 * requirement from the README, enforced server-side so a stolen aal1 token
 * can't reach admin routes.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid or expired session" });

  const claims = decodeJwt(token) as { aal?: string };
  if (claims.aal !== "aal2") {
    return res.status(403).json({ error: "Potrebna je dvostepena prijava (MFA)" });
  }

  req.adminUserId = data.user.id;
  next();
}
