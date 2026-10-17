import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getPorudzbinaStatus } from "../../lib/api";

const STEPS = [
  { status: "kreirana", label: "Porudžbina kreirana" },
  { status: "placena", label: "Plaćeno na kasi" },
  { status: "u_proizvodnji", label: "U proizvodnji" },
  { status: "poslata_u_prodavnicu", label: "Poslato u prodavnicu" },
  { status: "spremna_za_preuzimanje", label: "Spremno za preuzimanje" },
  { status: "preuzeta", label: "Preuzeto" },
];

type OrderInfo = Awaited<ReturnType<typeof getPorudzbinaStatus>>["porudzbina"];

export default function Status() {
  const { kod: kodParam } = useParams<{ kod?: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState(kodParam ?? "");
  const [info, setInfo] = useState<OrderInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kodParam) return;
    getPorudzbinaStatus(kodParam)
      .then((r) => {
        setInfo(r.porudzbina);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [kodParam]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) navigate(`/status/${search.trim().toUpperCase()}`);
  }

  const reachedIndex = info ? STEPS.findIndex((s) => s.status === info.status) : -1;
  const isSideState = info && !STEPS.some((s) => s.status === info.status);

  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-line">
        <Link to="/" className="flex items-center gap-1.5 px-2 py-3 text-sm font-semibold no-underline text-ink">
          ← Početna
        </Link>
      </header>

      <form onSubmit={handleSearch} className="mx-5 mt-5 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Unesite kod porudžbine (npr. K7F-42)"
          className="flex-1 h-12 px-3.5 border border-[#A9B0B8] rounded-[10px] text-base bg-white uppercase"
        />
        <button type="submit" className="px-5 rounded-[10px] bg-accent text-white font-semibold text-sm">
          Prati
        </button>
      </form>

      {error && <p className="mx-5 mt-4 text-red-600 text-sm">{error}</p>}

      {info && (
        <>
          <section className="px-5 pt-6 flex flex-col gap-1">
            <span className="text-[13px] text-muted">Porudžbina {info.kod}</span>
            <h1 className="m-0 font-display font-extrabold text-[26px] tracking-tight">
              {isSideState ? (info.status === "otkazana" ? "Otkazana" : "Istekla") : STEPS[reachedIndex]?.label}
            </h1>
          </section>

          <section className="mx-5 mt-4 p-[18px] rounded-2xl bg-accent text-white flex flex-col gap-1.5">
            <span className="text-[13px] opacity-85">Prodavnica</span>
            <span className="font-display font-extrabold text-xl">{info.prodavnice.naziv}</span>
            <span className="text-sm">
              {info.prodavnice.adresa ? `${info.prodavnice.adresa}, ` : ""}
              {info.prodavnice.grad}
            </span>
          </section>

          {!isSideState && (
            <ol className="mx-5 mt-6 list-none p-0 flex flex-col">
              {STEPS.map((step, i) => {
                const done = i <= reachedIndex;
                const current = i === reachedIndex;
                return (
                  <li key={step.status} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-[22px] h-[22px] rounded-full box-border ${
                          done
                            ? current
                              ? "border-[6px] border-gold bg-ink"
                              : "bg-good"
                            : "border-2 border-[#A9B0B8] bg-white"
                        }`}
                      />
                      {i < STEPS.length - 1 && <span className={`w-0.5 flex-1 min-h-[34px] ${done ? "bg-good" : "bg-line"}`} />}
                    </div>
                    <div className="flex flex-col gap-0.5 pb-3.5">
                      <span className={`text-[15px] ${current ? "font-bold" : "font-semibold"} ${done ? "" : "text-[#3F454C]"}`}>
                        {step.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <section className="mx-5 mt-2 p-4 bg-white border border-line rounded-xl flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">
              {info.modeli.proizvodi.naziv} · {info.modeli.naziv}
            </span>
            <span className="text-[13px] text-muted">{Object.values(info.polja).filter(Boolean).join(" · ")}</span>
          </section>
        </>
      )}
    </div>
  );
}
