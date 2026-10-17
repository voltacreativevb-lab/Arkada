import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  getObavestenja,
  getRedZaIzradu,
  markObavestenjePoslato,
  setPorudzbinaStatus,
  type AdminPorudzbina,
  type Obavestenje,
} from "../../lib/api";

const STATUS_LABEL: Record<string, string> = {
  kreirana: "Čeka uplatu",
  placena: "Plaćeno",
  u_proizvodnji: "U izradi",
  poslata_u_prodavnicu: "Poslato u prodavnicu",
  spremna_za_preuzimanje: "Spremno za preuzimanje",
  preuzeta: "Preuzeto",
  otkazana: "Otkazana",
  istekla: "Istekla",
};

const NEXT_STATUS: Record<string, string | null> = {
  kreirana: "placena",
  placena: "u_proizvodnji",
  u_proizvodnji: "poslata_u_prodavnicu",
  poslata_u_prodavnicu: "spremna_za_preuzimanje",
  spremna_za_preuzimanje: "preuzeta",
  preuzeta: null,
};

function buildMessage(tip: Obavestenje["tip"], o: Obavestenje["porudzbine"]): string {
  const tekst = Object.values(o.polja).filter(Boolean).join(", ");
  if (tip === "u_proizvodnji") {
    return `Zdravo! Vaša MaestroVolta porudžbina ${o.kod} (${tekst}) je primljena u proizvodnju. Javićemo se čim bude spremna za preuzimanje. Hvala!`;
  }
  return `Zdravo! Vaša MaestroVolta porudžbina ${o.kod} (${tekst}) je stigla u prodavnicu ${o.prodavnice.naziv}. Možete je preuzeti kad vam odgovara.`;
}

export default function AdminRed() {
  const [orders, setOrders] = useState<AdminPorudzbina[] | null>(null);
  const [obavestenja, setObavestenja] = useState<Obavestenje[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      const [q, o] = await Promise.all([getRedZaIzradu(), getObavestenja()]);
      setOrders(q.porudzbine);
      setObavestenja(o.obavestenja);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function advance(kod: string, current: string) {
    const next = NEXT_STATUS[current];
    if (!next) return;
    setBusy(kod);
    try {
      await setPorudzbinaStatus(kod, next);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  function openChat(tip: Obavestenje["tip"], o: Obavestenje["porudzbine"]) {
    const message = buildMessage(tip, o);
    const phone = (o.telefon_kupca ?? "").replace(/\D/g, "");
    if (o.kanal_obavestavanja === "viber") {
      navigator.clipboard.writeText(message);
      window.open(`viber://chat?number=${phone}`, "_blank");
    } else {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    }
  }

  async function markSent(id: string) {
    setBusy(id);
    try {
      await markObavestenjePoslato(id);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink flex flex-col">
      <header className="flex items-center justify-between px-8 py-3.5 bg-[#16191D] text-white">
        <div className="flex items-center gap-7">
          <span className="font-display font-extrabold text-lg">MaestroVolta · Proizvodnja</span>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-[#C9CED4]">
          Odjava
        </button>
      </header>

      {error && <p className="mx-8 mt-4 text-red-600 text-sm">{error}</p>}

      <div className="flex-1 flex gap-5 p-6 lg:p-8 min-h-0">
        <section className="flex-1 min-w-0 bg-white border border-line rounded-2xl overflow-hidden flex flex-col">
          <div className="flex justify-between items-center px-4.5 py-3.5 border-b border-[#E3E6EA]">
            <h2 className="m-0 text-base font-bold">Red za izradu</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wide">
                  <th className="px-4.5 py-2.5 font-semibold">Kod</th>
                  <th className="px-2 py-2.5 font-semibold">Prodavnica</th>
                  <th className="px-2 py-2.5 font-semibold">Proizvod</th>
                  <th className="px-2 py-2.5 font-semibold">Tekst</th>
                  <th className="px-2 py-2.5 font-semibold">Status</th>
                  <th className="px-4.5 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {orders?.map((o) => (
                  <tr key={o.kod} className="border-t border-[#E3E6EA]">
                    <td className="px-4.5 py-3 font-bold">{o.kod}</td>
                    <td className="px-2 py-3">{o.prodavnice.naziv}</td>
                    <td className="px-2 py-3">
                      {o.modeli.proizvodi.naziv} · {o.modeli.naziv}
                    </td>
                    <td className="px-2 py-3">{Object.values(o.polja).filter(Boolean).join(", ")}</td>
                    <td className="px-2 py-3">
                      <span className="inline-block px-2.5 py-1 rounded-full bg-[#DCEAF3] text-[#163A50] text-xs font-semibold">
                        {STATUS_LABEL[o.status]}
                      </span>
                    </td>
                    <td className="px-4.5 py-3 text-right">
                      {NEXT_STATUS[o.status] && (
                        <button
                          onClick={() => advance(o.kod, o.status)}
                          disabled={busy === o.kod}
                          className="h-9 px-3 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50"
                        >
                          → {STATUS_LABEL[NEXT_STATUS[o.status]!]}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders?.length === 0 && <p className="p-4.5 text-sm text-muted">Nema aktivnih porudžbina.</p>}
          </div>
        </section>

        <aside className="w-[340px] shrink-0 flex flex-col gap-4">
          <section className="bg-white border border-line rounded-2xl p-4.5 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h2 className="m-0 text-base font-bold">Za obavestiti</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-ink text-white text-[13px] font-bold">{obavestenja?.length ?? 0}</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {obavestenja?.map((ob) => (
                <div key={ob.id} className="p-3 rounded-[10px] bg-[#EEF0F2] flex flex-col gap-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-bold text-sm">{ob.porudzbine.kod}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#DCEAF3] text-[#163A50] text-xs font-semibold">
                      {ob.tip === "u_proizvodnji" ? "Primljeno" : "Stiglo u radnju"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openChat(ob.tip, ob.porudzbine)}
                      disabled={!ob.porudzbine.telefon_kupca}
                      className={`flex-1 h-11 rounded-[9px] text-white text-sm font-bold disabled:opacity-40 ${
                        ob.porudzbine.kanal_obavestavanja === "viber" ? "bg-[#5B3E99]" : "bg-good"
                      }`}
                    >
                      {ob.porudzbine.kanal_obavestavanja === "viber" ? "Kopiraj i otvori Viber" : "Pošalji na WhatsApp"}
                    </button>
                    <button
                      onClick={() => markSent(ob.id)}
                      disabled={busy === ob.id}
                      className="h-11 px-3 rounded-[9px] border border-[#A9B0B8] bg-white text-ink text-[13px] font-semibold disabled:opacity-50"
                    >
                      Poslato
                    </button>
                  </div>
                </div>
              ))}
              {obavestenja?.length === 0 && <p className="text-sm text-muted m-0">Nema poruka za slanje.</p>}
            </div>
            <span className="text-xs text-muted">
              Dugme otvara razgovor sa kupcem i gotovom porukom. Viber ne može sam da upiše tekst, pa ga dugme kopira za lepljenje.
            </span>
          </section>
        </aside>
      </div>
    </div>
  );
}
