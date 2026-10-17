import { useEffect, useState } from "react";
import { downloadFinansijeCsv, getFinansije, type Finansije } from "../../lib/api";
import { HBarChart, StatTile, TrendChart } from "../../components/admin/Charts";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, 1);
}

const PRESETS = [
  { key: "30d", label: "Poslednjih 30 dana", od: () => fmtDate(new Date(Date.now() - 29 * 86400000)), do: () => fmtDate(new Date()) },
  { key: "ovaj", label: "Ovaj mesec", od: () => fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), do: () => fmtDate(new Date()) },
  { key: "prosli", label: "Prošli mesec", od: () => fmtDate(monthsAgo(1)), do: () => fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 0)) },
  { key: "sve", label: "Sve", od: () => "2020-01-01", do: () => fmtDate(new Date()) },
];

const MONTHS_SR = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];

export default function AdminFinance() {
  const [preset, setPreset] = useState("30d");
  const [data, setData] = useState<Finansije | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const active = PRESETS.find((p) => p.key === preset)!;

  async function refresh() {
    try {
      const d = await getFinansije(active.od(), active.do());
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadFinansijeCsv(active.od(), active.do());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri izvozu");
    } finally {
      setExporting(false);
    }
  }

  const trend = data?.po_danu.map((d) => ({ label: MONTHS_SR[Number(d.datum.slice(5, 7)) - 1] + " " + d.datum.slice(8, 10), value: d.prihod })) ?? [];
  const prosecna = data && data.ukupno.broj_porudzbina > 0 ? Math.round(data.ukupno.prihod / data.ukupno.broj_porudzbina) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl m-0">Finansije</h1>
        <button onClick={handleExport} disabled={exporting} className="h-10 px-4 rounded-lg border border-line bg-white text-sm font-semibold disabled:opacity-50">
          {exporting ? "Izvoz…" : "Izvezi CSV"}
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`text-xs font-medium px-3.5 py-1.5 rounded-full border transition-colors ${
              preset === p.key ? "bg-ink text-white border-ink" : "bg-white text-muted border-line hover:border-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {!data && !error && <p className="text-sm text-muted">Učitavanje…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatTile label="Ukupan prihod" value={`${data.ukupno.prihod.toLocaleString("sr-RS")} din`} color="#2a78d6" />
            <StatTile label="Plaćenih porudžbina" value={data.ukupno.broj_porudzbina} />
            <StatTile label="Prosečna vrednost" value={`${prosecna.toLocaleString("sr-RS")} din`} />
          </div>

          <div className="bg-white border border-line rounded-xl p-5 mb-6">
            <h2 className="font-semibold mb-4 text-[15px]">Prihod po danu</h2>
            <TrendChart data={trend} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <div className="bg-white border border-line rounded-xl p-5">
              <h2 className="font-semibold mb-4 text-[15px]">Prihod po prodavnici</h2>
              <HBarChart data={data.po_prodavnici.map((p) => ({ label: p.naziv, value: p.prihod }))} />
            </div>
            <div className="bg-white border border-line rounded-xl p-5">
              <h2 className="font-semibold mb-4 text-[15px]">Prihod po proizvodu</h2>
              <HBarChart data={data.po_proizvodu.map((p) => ({ label: p.naziv, value: p.prihod }))} />
            </div>
          </div>

          <div className="bg-white border border-line rounded-xl overflow-hidden">
            <h2 className="font-semibold text-[15px] px-5 pt-5">Obračun po prodavnici</h2>
            <p className="text-xs text-muted px-5 pb-3 pt-1 m-0">Udeo prodavnice se menja na stranici te prodavnice.</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wide border-t border-line">
                  <th className="px-5 py-2.5 font-semibold">Prodavnica</th>
                  <th className="px-2 py-2.5 font-semibold">Porudžbina</th>
                  <th className="px-2 py-2.5 font-semibold">Prihod</th>
                  <th className="px-2 py-2.5 font-semibold">Udeo</th>
                  <th className="px-2 py-2.5 font-semibold">Zarada prodavnice</th>
                  <th className="px-5 py-2.5 font-semibold">Zarada platforme</th>
                </tr>
              </thead>
              <tbody>
                {data.po_prodavnici.map((p) => (
                  <tr key={p.prodavnica_id} className="border-t border-[#EEF0F2]">
                    <td className="px-5 py-3 font-medium">{p.naziv}</td>
                    <td className="px-2 py-3">{p.broj_porudzbina}</td>
                    <td className="px-2 py-3 tabular-nums">{p.prihod.toLocaleString("sr-RS")} din</td>
                    <td className="px-2 py-3">{Math.round(p.udeo_prodavnice * 100)}%</td>
                    <td className="px-2 py-3 tabular-nums">{p.zarada_prodavnice.toLocaleString("sr-RS")} din</td>
                    <td className="px-5 py-3 tabular-nums font-medium">{p.zarada_platforme.toLocaleString("sr-RS")} din</td>
                  </tr>
                ))}
                {data.po_prodavnici.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-muted">
                      Nema podataka za ovaj period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
