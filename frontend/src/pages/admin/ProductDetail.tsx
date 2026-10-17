import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PoljeDef } from "@maestrovolta/sablon-core";
import {
  createAdminModel,
  getAdminProizvodDetail,
  parseSablon,
  updateAdminModel,
  updateAdminProizvod,
  type AdminModel,
  type AdminProizvod,
} from "../../lib/api";

type FieldDraft = Omit<PoljeDef, "key" | "placeholder" | "default_x" | "default_y"> & {
  key: string;
  placeholder: string;
  default_x: number;
  default_y: number;
};

function labelFromKey(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

export default function AdminProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [proizvod, setProizvod] = useState<AdminProizvod | null>(null);
  const [modeli, setModeli] = useState<AdminModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [naziv, setNaziv] = useState("");
  const [opis, setOpis] = useState("");
  const [osnovnaCena, setOsnovnaCena] = useState(0);

  // --- Add-model flow state ---
  const [showAddModel, setShowAddModel] = useState(false);
  const [modelNaziv, setModelNaziv] = useState("");
  const [modelKod, setModelKod] = useState("");
  const [modelCena, setModelCena] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldDraft[] | null>(null);
  const [submittingModel, setSubmittingModel] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const { proizvod: p, modeli: m } = await getAdminProizvodDetail(id);
      setProizvod(p);
      setModeli(m);
      setNaziv(p.naziv);
      setOpis(p.opis ?? "");
      setOsnovnaCena(p.osnovna_cena);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveProduct() {
    if (!id) return;
    setSaving(true);
    try {
      await updateAdminProizvod(id, { naziv, opis: opis || null, osnovna_cena: osnovnaCena });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri čuvanju");
    } finally {
      setSaving(false);
    }
  }

  async function toggleProductActive() {
    if (!id || !proizvod) return;
    await updateAdminProizvod(id, { aktivan: !proizvod.aktivan });
    load();
  }

  async function analyzeTemplate() {
    if (!file) return;
    setParseError(null);
    setParsing(true);
    try {
      const { fields: detected } = await parseSablon(file);
      setFields(
        detected.map((f) => ({
          key: f.key,
          placeholder: f.placeholder,
          default_x: f.default_x,
          default_y: f.default_y,
          label: labelFromKey(f.key),
          max_len: 30,
          min_mm: 5,
          max_mm: 30,
          default_mm: 15,
          required: true,
        }))
      );
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Greška pri analizi šablona");
    } finally {
      setParsing(false);
    }
  }

  function updateField(key: string, patch: Partial<FieldDraft>) {
    setFields((prev) => (prev ? prev.map((f) => (f.key === key ? { ...f, ...patch } : f)) : prev));
  }

  async function submitModel(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !file || !fields) return;
    setSubmittingModel(true);
    setParseError(null);
    try {
      await createAdminModel(id, {
        naziv: modelNaziv,
        kod: modelKod,
        cena: modelCena ? Number(modelCena) : undefined,
        polja: fields,
        sablon: file,
      });
      setShowAddModel(false);
      setModelNaziv("");
      setModelKod("");
      setModelCena("");
      setFile(null);
      setFields(null);
      load();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Greška pri čuvanju modela");
    } finally {
      setSubmittingModel(false);
    }
  }

  async function toggleModelActive(m: AdminModel) {
    await updateAdminModel(m.id, { aktivan: !m.aktivan });
    load();
  }

  if (!proizvod) {
    return <div className="p-8">{error ? <p className="text-red-600 text-sm">{error}</p> : <p className="text-sm text-muted">Učitavanje…</p>}</div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <Link to="/admin/katalog" className="text-sm text-muted hover:text-accent">
        ← Nazad na katalog
      </Link>

      <div className="flex items-center gap-3 mt-2 mb-6">
        <h1 className="font-display font-bold text-2xl m-0">{proizvod.naziv}</h1>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${proizvod.aktivan ? "bg-[#DDEFE4] text-[#134A2F]" : "bg-[#F3D7D7] text-[#7A1F1F]"}`}>
          {proizvod.aktivan ? "Aktivan" : "Neaktivan"}
        </span>
      </div>

      <div className="bg-white border border-line rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-4">Podaci o proizvodu</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-medium text-muted col-span-2">
            Naziv
            <input className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1" value={naziv} onChange={(e) => setNaziv(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-muted">
            Osnovna cena
            <input
              type="number"
              className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1"
              value={osnovnaCena}
              onChange={(e) => setOsnovnaCena(Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-muted col-span-2">
            Opis
            <input className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1" value={opis} onChange={(e) => setOpis(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={saveProduct} disabled={saving} className="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {saving ? "Čuvanje…" : "Sačuvaj"}
          </button>
          <button onClick={toggleProductActive} className="h-10 px-4 rounded-lg border border-line text-sm font-semibold">
            {proizvod.aktivan ? "Deaktiviraj" : "Aktiviraj"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold m-0">Modeli</h2>
          <button onClick={() => setShowAddModel((s) => !s)} className="h-9 px-3 rounded-lg bg-accent text-white text-xs font-semibold">
            {showAddModel ? "Otkaži" : "+ Dodaj model"}
          </button>
        </div>

        <ul className="space-y-2 mb-5">
          {modeli.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#EEF0F2]">
              <div>
                <div className="font-medium text-sm">
                  {m.naziv} <span className="text-muted">({m.kod})</span>
                </div>
                <div className="text-xs text-muted">{m.polja.length} polje(a) za tekst · {m.cena ? `${m.cena} din` : "osnovna cena"}</div>
              </div>
              <button onClick={() => toggleModelActive(m)} className="h-9 px-3 rounded-lg border border-line bg-white text-xs font-semibold">
                {m.aktivan ? "Deaktiviraj" : "Aktiviraj"}
              </button>
            </li>
          ))}
          {modeli.length === 0 && <p className="text-sm text-muted">Nema još nijednog modela.</p>}
        </ul>

        {showAddModel && (
          <form onSubmit={submitModel} className="border-t border-line pt-5 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <input className="h-10 px-3 border border-line rounded-lg text-sm col-span-2" placeholder="Naziv modela (npr. Hrast)" value={modelNaziv} onChange={(e) => setModelNaziv(e.target.value)} required />
              <input className="h-10 px-3 border border-line rounded-lg text-sm" placeholder="Kod (A, B…)" value={modelKod} onChange={(e) => setModelKod(e.target.value)} required />
            </div>
            <input
              className="h-10 px-3 border border-line rounded-lg text-sm"
              type="number"
              placeholder="Cena override (nije obavezno)"
              value={modelCena}
              onChange={(e) => setModelCena(e.target.value)}
            />

            <label className="text-xs font-medium text-muted">
              SVG šablon (izvoz iz CorelDRAW-a)
              <input
                type="file"
                accept=".svg,image/svg+xml"
                className="block w-full text-sm mt-1"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setFields(null);
                }}
              />
            </label>

            {file && !fields && (
              <button type="button" onClick={analyzeTemplate} disabled={parsing} className="h-10 rounded-lg border border-accent text-accent text-sm font-semibold disabled:opacity-50">
                {parsing ? "Analiziram…" : "Analiziraj šablon"}
              </button>
            )}

            {parseError && <p className="text-red-600 text-sm m-0">{parseError}</p>}

            {fields && (
              <div className="flex flex-col gap-3 mt-2 pt-3 border-t border-line">
                <p className="text-xs text-muted m-0">
                  Prepoznato {fields.length} polje(a) za tekst u šablonu. Proveri/izmeni granice pre čuvanja.
                </p>
                {fields.map((f) => (
                  <div key={f.key} className="p-3 rounded-lg bg-[#EEF0F2] grid grid-cols-4 gap-2 items-end">
                    <label className="text-[11px] font-medium text-muted col-span-2">
                      Oznaka ({f.key})
                      <input className="w-full h-9 px-2 border border-line rounded-md text-sm mt-1" value={f.label} onChange={(e) => updateField(f.key, { label: e.target.value })} />
                    </label>
                    <label className="text-[11px] font-medium text-muted">
                      Maks. karaktera
                      <input type="number" className="w-full h-9 px-2 border border-line rounded-md text-sm mt-1" value={f.max_len} onChange={(e) => updateField(f.key, { max_len: Number(e.target.value) })} />
                    </label>
                    <label className="text-[11px] font-medium text-muted flex items-center gap-1.5 mt-4">
                      <input type="checkbox" checked={f.required} onChange={(e) => updateField(f.key, { required: e.target.checked })} />
                      Obavezno
                    </label>
                    <label className="text-[11px] font-medium text-muted">
                      Min mm
                      <input type="number" className="w-full h-9 px-2 border border-line rounded-md text-sm mt-1" value={f.min_mm} onChange={(e) => updateField(f.key, { min_mm: Number(e.target.value) })} />
                    </label>
                    <label className="text-[11px] font-medium text-muted">
                      Podrazumevano mm
                      <input type="number" className="w-full h-9 px-2 border border-line rounded-md text-sm mt-1" value={f.default_mm} onChange={(e) => updateField(f.key, { default_mm: Number(e.target.value) })} />
                    </label>
                    <label className="text-[11px] font-medium text-muted">
                      Maks mm
                      <input type="number" className="w-full h-9 px-2 border border-line rounded-md text-sm mt-1" value={f.max_mm} onChange={(e) => updateField(f.key, { max_mm: Number(e.target.value) })} />
                    </label>
                  </div>
                ))}
                <button disabled={submittingModel} className="h-11 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
                  {submittingModel ? "Čuvanje…" : "Sačuvaj model"}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
