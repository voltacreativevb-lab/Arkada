import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createAdminRadnik,
  getAdminProdavnicaDetail,
  updateAdminProdavnica,
  updateAdminRadnik,
  type AdminProdavnica,
  type AdminRadnik,
} from "../../lib/api";

export default function AdminStoreDetail() {
  const { id } = useParams<{ id: string }>();
  const [prodavnica, setProdavnica] = useState<AdminProdavnica | null>(null);
  const [radnici, setRadnici] = useState<AdminRadnik[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [naziv, setNaziv] = useState("");
  const [grad, setGrad] = useState("");
  const [adresa, setAdresa] = useState("");
  const [radnoVreme, setRadnoVreme] = useState("");
  const [udeo, setUdeo] = useState(0.4);

  const [newIme, setNewIme] = useState("");
  const [newPin, setNewPin] = useState("");
  const [addingWorker, setAddingWorker] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    try {
      const { prodavnica: p, radnici: r } = await getAdminProdavnicaDetail(id);
      setProdavnica(p);
      setRadnici(r);
      setNaziv(p.naziv);
      setGrad(p.grad);
      setAdresa(p.adresa ?? "");
      setRadnoVreme(p.radno_vreme ?? "");
      setUdeo(p.udeo_prodavnice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveDetails() {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await updateAdminProdavnica(id, { naziv, grad, adresa: adresa || null, radno_vreme: radnoVreme || null, udeo_prodavnice: udeo });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri čuvanju");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!id || !prodavnica) return;
    setSaving(true);
    try {
      await updateAdminProdavnica(id, { aktivna: !prodavnica.aktivna });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function addWorker(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setWorkerError(null);
    setAddingWorker(true);
    try {
      await createAdminRadnik(id, { ime: newIme, pin: newPin });
      setNewIme("");
      setNewPin("");
      load();
    } catch (err) {
      setWorkerError(err instanceof Error ? err.message : "Greška");
    } finally {
      setAddingWorker(false);
    }
  }

  async function toggleWorker(worker: AdminRadnik) {
    await updateAdminRadnik(worker.id, { aktivan: !worker.aktivan });
    load();
  }

  async function resetPin(worker: AdminRadnik) {
    const pin = prompt(`Novi PIN za ${worker.ime} (4-8 cifara):`);
    if (!pin) return;
    try {
      await updateAdminRadnik(worker.id, { pin });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Greška");
    }
  }

  if (!prodavnica) {
    return <div className="p-8">{error ? <p className="text-red-600 text-sm">{error}</p> : <p className="text-sm text-muted">Učitavanje…</p>}</div>;
  }

  const bookingLink = `${window.location.origin}/${prodavnica.slug}`;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link to="/admin/prodavnice" className="text-sm text-muted hover:text-accent">
        ← Nazad na listu
      </Link>

      <div className="flex items-center gap-3 mt-2 mb-6">
        <h1 className="font-display font-bold text-2xl m-0">{prodavnica.naziv}</h1>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${prodavnica.aktivna ? "bg-[#DDEFE4] text-[#134A2F]" : "bg-[#F3D7D7] text-[#7A1F1F]"}`}>
          {prodavnica.aktivna ? "Aktivna" : "Neaktivna"}
        </span>
      </div>

      <div className="bg-white border border-line rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-1">QR link za kupce</h2>
        <code className="block bg-[#EEF0F2] text-sm px-3 py-2.5 rounded-lg mt-2 break-all">{bookingLink}</code>
      </div>

      <div className="bg-white border border-line rounded-xl p-5 mb-6">
        <h2 className="font-semibold mb-4">Podaci o prodavnici</h2>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="text-xs font-medium text-muted col-span-2">
            Naziv
            <input className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1" value={naziv} onChange={(e) => setNaziv(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-muted">
            Grad
            <input className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1" value={grad} onChange={(e) => setGrad(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-muted">
            Udeo prodavnice (0-1)
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1"
              value={udeo}
              onChange={(e) => setUdeo(Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-medium text-muted col-span-2">
            Adresa
            <input className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1" value={adresa} onChange={(e) => setAdresa(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-muted col-span-2">
            Radno vreme
            <input className="w-full h-11 px-3 border border-line rounded-lg text-sm mt-1" value={radnoVreme} onChange={(e) => setRadnoVreme(e.target.value)} />
          </label>
        </div>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={saveDetails} disabled={saving} className="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            {saving ? "Čuvanje…" : "Sačuvaj"}
          </button>
          <button onClick={toggleActive} disabled={saving} className="h-10 px-4 rounded-lg border border-line text-sm font-semibold disabled:opacity-50">
            {prodavnica.aktivna ? "Deaktiviraj" : "Aktiviraj"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-line rounded-xl p-5">
        <h2 className="font-semibold mb-4">Radnici</h2>

        <ul className="space-y-2 mb-5">
          {radnici.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#EEF0F2]">
              <div>
                <div className="font-medium text-sm">{r.ime}</div>
                <div className="text-xs text-muted">{r.aktivan ? "Aktivan" : "Deaktiviran"}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => resetPin(r)} className="h-9 px-3 rounded-lg border border-line bg-white text-xs font-semibold">
                  Resetuj PIN
                </button>
                <button onClick={() => toggleWorker(r)} className="h-9 px-3 rounded-lg border border-line bg-white text-xs font-semibold">
                  {r.aktivan ? "Deaktiviraj" : "Aktiviraj"}
                </button>
              </div>
            </li>
          ))}
          {radnici.length === 0 && <p className="text-sm text-muted">Nema još nijednog radnika.</p>}
        </ul>

        <form onSubmit={addWorker} className="flex gap-2">
          <input className="flex-1 h-10 px-3 border border-line rounded-lg text-sm" placeholder="Ime radnika" value={newIme} onChange={(e) => setNewIme(e.target.value)} required />
          <input
            className="w-28 h-10 px-3 border border-line rounded-lg text-sm"
            placeholder="PIN"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            required
            minLength={4}
          />
          <button disabled={addingWorker} className="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-50">
            Dodaj
          </button>
        </form>
        {workerError && <p className="text-red-600 text-sm mt-2">{workerError}</p>}
      </div>
    </div>
  );
}
