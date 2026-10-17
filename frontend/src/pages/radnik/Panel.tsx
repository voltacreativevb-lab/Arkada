import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getRadnikPorudzbine,
  radnikNaplaceno,
  radnikPreuzeto,
  radnikPrimljeno,
  type RadnikPorudzbina,
} from "../../lib/api";
import { clearWorkerSession, getWorkerInfo } from "../../lib/workerSession";

const STATUS_LABEL: Record<string, string> = {
  kreirana: "Čeka uplatu",
  placena: "Plaćeno",
  u_proizvodnji: "U izradi",
  poslata_u_prodavnicu: "Stiže paket",
  spremna_za_preuzimanje: "Za preuzimanje",
  preuzeta: "Preuzeto",
};

export default function RadnikPanel() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const info = getWorkerInfo();

  const [orders, setOrders] = useState<RadnikPorudzbina[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<"preuzimanje" | "paket">("preuzimanje");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const { porudzbine } = await getRadnikPorudzbine();
      setOrders(porudzbine);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    }
  }

  useEffect(() => {
    if (!info) {
      navigate(`/prodavnica/${slug}`);
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    clearWorkerSession();
    navigate(`/prodavnica/${slug}`);
  }

  const found = orders?.find((o) => o.kod.toUpperCase() === code.trim().toUpperCase());

  async function confirmPayment() {
    if (!found) return;
    setBusy(true);
    try {
      await radnikNaplaceno(found.kod);
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    } finally {
      setBusy(false);
    }
  }

  async function markReceived(kod: string) {
    setBusy(true);
    try {
      await radnikPrimljeno(kod);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function markPickedUp(kod: string) {
    setBusy(true);
    try {
      await radnikPreuzeto(kod);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const zaPreuzimanje = orders?.filter((o) => o.status === "spremna_za_preuzimanje") ?? [];
  const stizePaket = orders?.filter((o) => o.status === "poslata_u_prodavnicu") ?? [];

  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink flex flex-col">
      <header className="flex items-center justify-between px-7 py-4 bg-[#16191D] text-white">
        <div className="flex items-center gap-3.5">
          <span className="font-display font-extrabold text-lg">MaestroVolta</span>
          <span className="text-sm text-[#C9CED4]">{info?.prodavnica.naziv}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm">Radnik: {info?.radnik.ime}</span>
          <button onClick={handleLogout} className="h-11 px-4 rounded-[10px] border border-[#545B64] bg-transparent text-white text-sm">
            Odjavi se
          </button>
        </div>
      </header>

      {error && <p className="mx-7 mt-4 text-red-600 text-sm">{error}</p>}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 lg:p-7">
        <section className="lg:col-span-3 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-[15px] font-semibold">Kod porudžbine</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="npr. K7F-42"
              className="h-14 px-4 border-2 border-accent rounded-xl font-display font-bold text-2xl tracking-wider uppercase"
            />
          </div>

          {code && !found && <p className="text-sm text-muted">Nema porudžbine sa tim kodom koja čeka uplatu.</p>}

          {found && (
            <article className="flex-1 bg-white border border-line rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="font-display font-extrabold text-xl">{found.kod}</span>
                <span className="px-3 py-1.5 rounded-full bg-warn text-warn-fg text-[13px] font-semibold">
                  {STATUS_LABEL[found.status]}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 text-[15px]">
                <span>
                  <span className="text-muted">Proizvod:</span> <strong>{found.modeli.proizvodi.naziv} · {found.modeli.naziv}</strong>
                </span>
                <span>
                  <span className="text-muted">Tekst:</span> <strong>{Object.values(found.polja).filter(Boolean).join(" · ")}</strong>
                </span>
                {found.telefon_kupca && (
                  <span>
                    <span className="text-muted">Kupac:</span> {found.telefon_kupca}
                  </span>
                )}
              </div>
              <div className="px-4 py-3.5 rounded-xl bg-[#EEF0F2] flex justify-between items-baseline">
                <span className="text-base font-semibold">Naplatiti na kasi</span>
                <span className="font-display font-extrabold text-[30px]">{found.cena} din</span>
              </div>
              {found.status === "kreirana" && (
                <button
                  onClick={confirmPayment}
                  disabled={busy}
                  className="mt-auto h-16 rounded-2xl bg-good text-white font-bold text-lg disabled:opacity-50"
                >
                  Naplaćeno — potvrdi uplatu
                </button>
              )}
            </article>
          )}
        </section>

        <aside className="lg:col-span-2 flex flex-col gap-3.5">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("preuzimanje")}
              aria-pressed={tab === "preuzimanje"}
              className={`flex-1 h-11 rounded-[10px] text-sm font-semibold ${
                tab === "preuzimanje" ? "border-2 border-accent text-accent bg-white" : "border border-line bg-white text-[#3F454C]"
              }`}
            >
              Za preuzimanje ({zaPreuzimanje.length})
            </button>
            <button
              onClick={() => setTab("paket")}
              aria-pressed={tab === "paket"}
              className={`flex-1 h-11 rounded-[10px] text-sm font-semibold ${
                tab === "paket" ? "border-2 border-accent text-accent bg-white" : "border border-line bg-white text-[#3F454C]"
              }`}
            >
              Stiže paket ({stizePaket.length})
            </button>
          </div>

          {(tab === "preuzimanje" ? zaPreuzimanje : stizePaket).map((o) => (
            <div key={o.kod} className="bg-white border border-line rounded-xl px-4 py-3.5 flex justify-between items-center">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-[15px]">{o.kod}</span>
                <span className="text-[13px] text-muted">
                  {o.modeli.proizvodi.naziv} · {Object.values(o.polja).filter(Boolean)[0]}
                </span>
              </div>
              <button
                onClick={() => (tab === "preuzimanje" ? markPickedUp(o.kod) : markReceived(o.kod))}
                disabled={busy}
                className="h-11 px-3.5 rounded-[10px] bg-gold text-ink text-sm font-bold disabled:opacity-50"
              >
                {tab === "preuzimanje" ? "Preuzeto" : "Primljeno"}
              </button>
            </div>
          ))}
          {(tab === "preuzimanje" ? zaPreuzimanje : stizePaket).length === 0 && (
            <p className="text-sm text-muted">Nema porudžbina u ovoj listi.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
