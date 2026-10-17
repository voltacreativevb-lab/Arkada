import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getKatalog, getProdavnica, type Prodavnica, type Proizvod } from "../../lib/api";
import ProductPreview from "../../components/ProductPreview";

export default function Main() {
  const { slug } = useParams<{ slug: string }>();
  const [prodavnica, setProdavnica] = useState<Prodavnica | null>(null);
  const [proizvodi, setProizvodi] = useState<Proizvod[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    Promise.all([getProdavnica(slug), getKatalog(slug)])
      .then(([p, k]) => {
        setProdavnica(p.prodavnica);
        setProizvodi(k.proizvodi);
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF0F2] p-6 text-center">
        <p className="text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 bg-white border-b border-line">
        <div className="flex flex-col gap-0.5">
          <span className="font-display font-extrabold text-xl tracking-tight">MaestroVolta</span>
          <span className="text-xs text-muted">Personalizovano za vaš dom</span>
        </div>
        <Link to="/status" className="text-sm font-semibold px-1 py-3">
          Moja porudžbina
        </Link>
      </header>

      {prodavnica && (
        <div className="mx-5 mt-4 p-3.5 rounded-xl bg-accent text-white flex items-center gap-3">
          <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-85">Kupujete u prodavnici</span>
            <span className="text-[15px] font-semibold">{prodavnica.naziv} · {prodavnica.grad}</span>
          </div>
        </div>
      )}

      <section className="px-5 pt-6 pb-2 flex flex-col gap-2.5">
        <h1 className="font-display font-extrabold text-[32px] leading-[1.05] tracking-tight m-0">
          Napravite ga
          <br />
          sa svojim imenom
        </h1>
        <p className="text-[15px] leading-normal text-[#3F454C] m-0">
          Izaberite proizvod i upišite tekst. Platite na kasi, a gotov proizvod preuzimate ovde.
        </p>
      </section>

      <ol className="list-none m-0 mx-5 mt-3 grid grid-cols-3 gap-2 p-0">
        {["Izaberite i upišite", "Platite na kasi", "Preuzmite ovde"].map((step, i) => (
          <li key={step} className="bg-white border border-line rounded-[10px] p-2.5 flex flex-col gap-1.5">
            <span className="w-6 h-6 rounded-full bg-gold text-ink font-bold text-[13px] flex items-center justify-center">{i + 1}</span>
            <span className="text-[13px] font-semibold">{step}</span>
          </li>
        ))}
      </ol>

      <h2 className="font-display font-bold text-lg mx-5 mt-6 mb-3">Proizvodi</h2>

      {!proizvodi && <p className="mx-5 text-sm text-muted">Učitavanje…</p>}
      {proizvodi?.length === 0 && <p className="mx-5 text-sm text-muted">Trenutno nema dostupnih proizvoda.</p>}

      <div className="mx-5 mb-6 grid grid-cols-2 gap-3">
        {proizvodi?.map((p) => (
          <Link
            key={p.id}
            to={`/${slug}/konfigurator/${p.id}`}
            className="no-underline text-ink bg-white border border-line rounded-xl overflow-hidden flex flex-col"
          >
            <div className="h-28 bg-[#E3E6EA] flex items-center justify-center text-sm text-muted overflow-hidden">
              {p.slika_glavna ? (
                <img src={p.slika_glavna} alt={p.naziv} className="w-full h-full object-cover" />
              ) : p.modeli[0] ? (
                <ProductPreview modelId={p.modeli[0].id} className="w-full h-full p-3 [&>svg]:w-full [&>svg]:h-full" />
              ) : (
                p.naziv
              )}
            </div>
            <div className="px-3 pt-2.5 pb-3 flex flex-col gap-0.5">
              <span className="font-semibold text-[15px]">{p.naziv}</span>
              <span className="text-[13px] text-muted">
                {p.modeli.length} model(a) · od {Math.round(p.modeli[0]?.cena ?? p.osnovna_cena)} din
              </span>
            </div>
          </Link>
        ))}
      </div>

      <p className="mx-5 mb-6 text-[13px] leading-normal text-muted">
        Bez registracije i bez plaćanja na sajtu. Platite na kasi ove prodavnice.
      </p>
    </div>
  );
}
