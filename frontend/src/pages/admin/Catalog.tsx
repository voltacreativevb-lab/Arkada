import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createAdminProizvod, getAdminProizvodi, type AdminProizvod } from "../../lib/api";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminCatalog() {
  const [products, setProducts] = useState<AdminProizvod[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [naziv, setNaziv] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [opis, setOpis] = useState("");
  const [cena, setCena] = useState("");
  const [slika, setSlika] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh() {
    try {
      const { proizvodi } = await getAdminProizvodi();
      setProducts(proizvodi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await createAdminProizvod({
        naziv,
        slug: slug || slugify(naziv),
        opis: opis || undefined,
        osnovna_cena: Number(cena),
        slika: slika ?? undefined,
      });
      setShowForm(false);
      setNaziv("");
      setSlug("");
      setSlugTouched(false);
      setOpis("");
      setCena("");
      setSlika(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Greška pri kreiranju");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl m-0">Katalog</h1>
        <button onClick={() => setShowForm((s) => !s)} className="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold">
          {showForm ? "Otkaži" : "+ Novi proizvod"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-line rounded-xl p-5 mb-6 grid grid-cols-2 gap-3">
          <input
            className="col-span-2 h-11 px-3 border border-line rounded-lg text-sm"
            placeholder="Naziv proizvoda"
            value={naziv}
            onChange={(e) => {
              setNaziv(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            required
          />
          <input
            className="h-11 px-3 border border-line rounded-lg text-sm"
            placeholder="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            required
          />
          <input
            className="h-11 px-3 border border-line rounded-lg text-sm"
            placeholder="Osnovna cena (din)"
            type="number"
            min={1}
            value={cena}
            onChange={(e) => setCena(e.target.value)}
            required
          />
          <input
            className="col-span-2 h-11 px-3 border border-line rounded-lg text-sm"
            placeholder="Opis (nije obavezno)"
            value={opis}
            onChange={(e) => setOpis(e.target.value)}
          />
          <label className="col-span-2 text-xs font-medium text-muted">
            Slika proizvoda (nije obavezno — ako je izostaviš, prikazuje se teksturirani pregled šablona)
            <input
              type="file"
              accept="image/*"
              className="block w-full text-sm mt-1"
              onChange={(e) => setSlika(e.target.files?.[0] ?? null)}
            />
          </label>
          {formError && <p className="col-span-2 text-red-600 text-sm m-0">{formError}</p>}
          <button disabled={submitting} className="col-span-2 h-11 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Kreiranje…" : "Kreiraj proizvod"}
          </button>
        </form>
      )}

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {!products && !error && <p className="text-sm text-muted">Učitavanje…</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products?.map((p) => (
          <Link key={p.id} to={`/admin/katalog/${p.id}`} className="bg-white border border-line rounded-xl overflow-hidden flex flex-col">
            <div className="h-32 bg-[#EEF0F2] flex items-center justify-center">
              {p.slika_glavna ? <img src={p.slika_glavna} alt={p.naziv} className="w-full h-full object-cover" /> : <span className="text-xs text-muted">Bez slike</span>}
            </div>
            <div className="p-3.5 flex items-center justify-between">
              <div>
                <div className="font-semibold text-[15px]">{p.naziv}</div>
                <div className="text-xs text-muted mt-0.5">
                  {p.broj_modela} model(a) · od {p.osnovna_cena} din
                </div>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.aktivan ? "bg-[#DDEFE4] text-[#134A2F]" : "bg-[#F3D7D7] text-[#7A1F1F]"}`}>
                {p.aktivan ? "Aktivan" : "Neaktivan"}
              </span>
            </div>
          </Link>
        ))}
        {products?.length === 0 && <p className="text-sm text-muted">Nema još nijednog proizvoda.</p>}
      </div>
    </div>
  );
}
