import { supabaseAdmin } from "./supabase.js";
import { transitionStatus } from "./statusTransitions.js";

/** Expires unpaid orders 48h after creation, per the README's lifecycle rule. */
export async function sweepExpiredOrders(): Promise<void> {
  const { data: expired, error } = await supabaseAdmin
    .from("porudzbine")
    .select("id")
    .eq("status", "kreirana")
    .lt("istice_u", new Date().toISOString());

  if (error) {
    console.error("Expiry sweep failed:", error.message);
    return;
  }

  for (const order of expired ?? []) {
    await transitionStatus(order.id, "istekla", "sistem", null, "Automatski istekla posle 48h bez uplate");
  }
}

export function startExpirySweep(intervalMs = 5 * 60 * 1000): void {
  sweepExpiredOrders();
  setInterval(sweepExpiredOrders, intervalMs);
}
