import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createAdminProdavnica, getAdminProdavnice, type AdminProdavnica } from "../../lib/api";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminStores() {
  const [stores, setStores] = useState<AdminProdavnica[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [naziv, setNaziv] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [grad, setGrad] = useState("");
  const [adresa, setAdresa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh() {
    try {
      const { prodavnice } = await getAdminProdavnice();
      setStores(prodavnice);
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
      await createAdminProdavnica({ naziv, slug: slug || slugify(naziv), grad, adresa: adresa || undefined });
      setShowForm(false);
      setNaziv("");
      setSlug("");
      setSlugTouched(false);
      setGrad("");
      setAdresa("");
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Greška pri kreiranju");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl">Prodavnice</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold"
        >
          {showForm ? "Otkaži" : "+ Nova prodavnica"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-line rounded-xl p-5 mb-6 grid grid-cols-2 gap-3">
          <input
            className="col-span-2 h-11 px-3 border border-line rounded-lg text-sm"
            placeholder="Naziv prodavnice"
            value={naziv}
            onChange={(e) => {
              setNaziv(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            required
          />
          <input
            className="h-11 px-3 border border-line rounded-lg text-sm"
            placeholder="slug (za QR link)"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            required
          />
          <input className="h-11 px-3 border border-line rounded-lg text-sm" placeholder="Grad" value={grad} onChange={(e) => setGrad(e.target.value)} required />
          <input
            className="col-span-2 h-11 px-3 border border-line rounded-lg text-sm"
            placeholder="Adresa (nije obavezno)"
            value={adresa}
            onChange={(e) => setAdresa(e.target.value)}
          />
          {formError && <p className="col-span-2 text-red-600 text-sm m-0">{formError}</p>}
          <button disabled={submitting} className="col-span-2 h-11 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {submitting ? "Kreiranje…" : "Kreiraj prodavnicu"}
          </button>
        </form>
      )}

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {!stores && !error && <p className="text-sm text-muted">Učitavanje…</p>}

      <div className="bg-white border border-line rounded-xl divide-y divide-[#EEF0F2]">
        {stores?.length === 0 && <p className="p-5 text-sm text-muted">Nema još nijedne prodavnice.</p>}
        {stores?.map((s) => (
          <Link key={s.id} to={`/admin/prodavnice/${s.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-[#F8F9FA]">
            <div>
              <div className="font-semibold text-[15px]">{s.naziv}</div>
              <div className="text-xs text-muted mt-0.5">
                {s.grad} · /{s.slug} · {s.broj_radnika} radnik(a) · {s.broj_porudzbina} porudžbina
              </div>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${s.aktivna ? "bg-[#DDEFE4] text-[#134A2F]" : "bg-[#F3D7D7] text-[#7A1F1F]"}`}>
              {s.aktivna ? "Aktivna" : "Neaktivna"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
