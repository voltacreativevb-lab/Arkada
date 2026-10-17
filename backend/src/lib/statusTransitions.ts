import { supabaseAdmin } from "./supabase.js";

type ActorType = "kupac" | "radnik" | "admin" | "sistem";

/** The two customer-notification points from the README, keyed by the status that triggers them. */
const NOTIFY_ON_STATUS: Record<string, "u_proizvodnji" | "stiglo_u_prodavnicu" | undefined> = {
  placena: "u_proizvodnji",
  spremna_za_preuzimanje: "stiglo_u_prodavnicu",
};

/**
 * Moves an order to a new status, logs it to istorija_statusa, and — at the
 * two points the README specifies — queues a customer-notification row.
 * Centralized here so every caller (radnik "Naplaćeno", admin queue, the
 * expiry sweep) gets the same side effects instead of duplicating them.
 */
export async function transitionStatus(
  porudzbinaId: string,
  status: string,
  actorType: ActorType,
  actorId: string | null,
  napomena?: string
): Promise<void> {
  const { error: updateError } = await supabaseAdmin.from("porudzbine").update({ status }).eq("id", porudzbinaId);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("istorija_statusa").insert({
    porudzbina_id: porudzbinaId,
    status,
    actor_type: actorType,
    actor_id: actorId,
    napomena: napomena ?? null,
  });

  const notifyType = NOTIFY_ON_STATUS[status];
  if (notifyType) {
    await supabaseAdmin
      .from("obavestenja")
      .upsert({ porudzbina_id: porudzbinaId, tip: notifyType }, { onConflict: "porudzbina_id,tip", ignoreDuplicates: true });
  }
}
