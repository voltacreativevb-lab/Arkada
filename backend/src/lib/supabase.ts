import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
      "Copy backend/.env.example to backend/.env and fill in your Supabase project values."
  );
}

/**
 * Server-side client using the service role key. Bypasses RLS — this is the
 * ONLY client used by this backend. Customers and workers never talk to
 * Supabase directly (no Supabase Auth, no anon-key table access), so all
 * authorization is enforced explicitly here in Express, not via RLS.
 */
export const supabaseAdmin: SupabaseClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Request-scoped client acting AS the admin user (via their Supabase Auth
 * JWT) — used only to verify the admin's session/MFA state, never for
 * tenant-style RLS-gated queries (there are none in this app).
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(url!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
