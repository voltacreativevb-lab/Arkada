import { useEffect, useMemo, useState } from "react";
import { transliterate } from "@maestrovolta/sablon-core";
import {
  getIzboriMesta,
  getIzboriStanje,
  resetIzboriMesto,
  resetSveIzbori,
  runIzboriTest,
  setIzboriMesto,
  setIzboriStanje,
  type BirackoMesto,
} from "../../lib/api";

const TOTAL = 37;

type RowDraft = {
  broj: number;
  upisani: string;
  glasalo: string;
  sns: string;
  student: string;
  nevazeci: string;
  unet: boolean;
  updated_at: string | null;
};

function emptyDraft(broj: number): RowDraft {
  return { broj, upisani: "", glasalo: "", sns: "", student: "", nevazeci: "", unet: false, updated_at: null };
}

type Filter = "sve" | "nije" | "uneto";

export default function IzboriUnos() {
  const [rows, setRows] = useState<Record<number, RowDraft>>(() => {
    const init: Record<number, RowDraft> = {};
    for (let i = 1; i <= TOTAL; i++) init[i] = emptyDraft(i);
    return init;
  });
  const [filter, setFilter] = useState<Filter>("sve");
  const [saving, setSaving] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<number | null>(null);
  const [poruka, setPoruka] = useState("");
  const [objavljenaPoruka, setObjavljenaPoruka] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(false);
  const [pobeda, setPobeda] = useState(false);
  const [pobedaSaving, setPobedaSaving] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [resetting, setResetting] = useState(false);

  function applyMesta(mesta: BirackoMesto[]) {
    setRows((prev) => {
      const next = { ...prev };
      mesta.forEach((m) => {
        next[m.broj] = {
          broj: m.broj,
          upisani: m.unet ? String(m.upisani) : "",
          glasalo: m.unet ? String(m.glasalo) : "",
          sns: m.unet ? String(m.sns) : "",
          student: m.unet ? String(m.student) : "",
          nevazeci: m.unet ? String(m.nevazeci) : "",
          unet: m.unet,
          updated_at: m.unet ? m.updated_at : null,
        };
      });
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    getIzboriStanje()
      .then(({ stanje }) => {
        if (!active) return;
        setPoruka(stanje.poruka);
        setObjavljenaPoruka(stanje.poruka);
        setPobeda(stanje.pobeda_prikaz);
      })
      .catch(() => {
        // ostaje praznina — operater može ponovo da pokuša objavu
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getIzboriMesta()
      .then(({ mesta }) => {
        if (active) applyMesta(mesta);
      })
      .catch(() => {
        // prazna lista ostaje — operater i dalje može da unosi
      });
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    let done = 0,
      upisani = 0,
      glasalo = 0;
    Object.values(rows).forEach((r) => {
      if (r.unet) {
        done++;
        upisani += Number(r.upisani) || 0;
        glasalo += Number(r.glasalo) || 0;
      }
    });
    return { done, upisani, glasalo, izlaznost: upisani > 0 ? (glasalo / upisani) * 100 : 0 };
  }, [rows]);

  function updateField(broj: number, key: keyof RowDraft, value: string) {
    setRows((prev) => ({ ...prev, [broj]: { ...prev[broj], [key]: value } }));
  }

  async function save(broj: number) {
    const r = rows[broj];
    setSaving(broj);
    setSaveError(null);
    try {
      const { mesto } = await setIzboriMesto(broj, {
        upisani: Number(r.upisani) || 0,
        glasalo: Number(r.glasalo) || 0,
        sns: Number(r.sns) || 0,
        student: Number(r.student) || 0,
        nevazeci: Number(r.nevazeci) || 0,
      });
      setRows((prev) => ({
        ...prev,
        [broj]: { ...prev[broj], unet: mesto.unet, updated_at: mesto.updated_at },
      }));
    } catch {
      setSaveError(broj);
    } finally {
      setSaving(null);
    }
  }

  async function obrisi(broj: number) {
    if (!confirm(`Obrisati unete rezultate za biračko mesto ${broj}? Ovo se ne može poništiti.`)) return;
    setSaving(broj);
    setSaveError(null);
    try {
      await resetIzboriMesto(broj);
      setRows((prev) => ({
        ...prev,
        [broj]: emptyDraft(broj),
      }));
    } catch {
      setSaveError(broj);
    } finally {
      setSaving(null);
    }
  }

  async function objavi() {
    setPublishing(true);
    setPublishError(false);
    try {
      const cyr = transliterate(poruka, "cyr");
      const { stanje } = await setIzboriStanje({ poruka: cyr });
      setPoruka(stanje.poruka);
      setObjavljenaPoruka(stanje.poruka);
    } catch {
      setPublishError(true);
    } finally {
      setPublishing(false);
    }
  }

  async function togglePobeda() {
    setPobedaSaving(true);
    try {
      const { stanje } = await setIzboriStanje({ pobeda_prikaz: !pobeda });
      setPobeda(stanje.pobeda_prikaz);
    } catch {
      // ostaje na staroj vrednosti — operater može ponovo da pokuša
    } finally {
      setPobedaSaving(false);
    }
  }

  async function pokreniTest() {
    setTestRunning(true);
    try {
      await runIzboriTest();
      const [{ mesta }, { stanje }] = await Promise.all([getIzboriMesta(), getIzboriStanje()]);
      applyMesta(mesta);
      setPoruka(stanje.poruka);
      setObjavljenaPoruka(stanje.poruka);
      setPobeda(stanje.pobeda_prikaz);
    } catch {
      setTestRunning(false);
      return;
    }
    // Server sam gasi pobeda_prikaz nakon 10s (pobeda_until) — ovde samo
    // osvežimo prekidač u UI-ju da prati to, bez obzira da li ova stranica
    // ostane otvorena.
    setTimeout(async () => {
      try {
        const { stanje } = await getIzboriStanje();
        setPobeda(stanje.pobeda_prikaz);
      } catch {
        // ostaje kako je bilo — sledeći poll/učitavanje će se poklopiti
      } finally {
        setTestRunning(false);
      }
    }, 10500);
  }

  async function resetSve() {
    if (!confirm("Resetovati SVIH 37 biračkih mesta i objavljenu poruku na nulu? Ovo se ne može poništiti.")) return;
    setResetting(true);
    try {
      await resetSveIzbori();
      setRows(() => {
        const next: Record<number, RowDraft> = {};
        for (let i = 1; i <= TOTAL; i++) next[i] = emptyDraft(i);
        return next;
      });
      setPoruka("");
      setObjavljenaPoruka("");
      setPobeda(false);
    } catch {
      // ostaje kako je bilo — operater može ponovo da pokuša
    } finally {
      setResetting(false);
    }
  }

  const visibleRows = Object.values(rows)
    .sort((a, b) => a.broj - b.broj)
    .filter((r) => (filter === "uneto" ? r.unet : filter === "nije" ? !r.unet : true));

  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink">
      <div className="sticky top-0 z-10 bg-white border-b border-line px-4 py-3.5">
        <div className="max-w-[720px] mx-auto flex justify-between items-baseline gap-3 flex-wrap">
          <h1 className="font-display font-bold text-lg m-0">Unos rezultata</h1>
          <a href="/izbori/prikaz" target="_blank" rel="noopener noreferrer" className="text-accent text-sm font-semibold">
            TV prikaz →
          </a>
        </div>
        <div className="max-w-[720px] mx-auto flex gap-4.5 flex-wrap mt-2.5 text-[13px] text-muted">
          <span>
            Uneto: <b className="font-mono text-ink tabular-nums">{summary.done} / {TOTAL}</b>
          </span>
          <span>
            Upisanih: <b className="font-mono text-ink tabular-nums">{summary.upisani.toLocaleString("sr-RS")}</b>
          </span>
          <span>
            Glasalo: <b className="font-mono text-ink tabular-nums">{summary.glasalo.toLocaleString("sr-RS")}</b>
          </span>
          <span>
            Izlaznost: <b className="font-mono text-ink tabular-nums">{summary.izlaznost.toFixed(1)}%</b>
          </span>
        </div>
        <div className="max-w-[720px] mx-auto flex gap-2 mt-3 flex-wrap">
          {(["sve", "nije", "uneto"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border ${
                filter === f ? "bg-accent text-white border-accent" : "bg-[#EEF0F2] text-muted border-line"
              }`}
            >
              {f === "sve" ? `Sve (${TOTAL})` : f === "nije" ? "Nije uneto" : "Uneto"}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-[720px] mx-auto px-4 py-4.5 flex flex-col gap-3.5 pb-16">
        <div className="bg-white border border-line rounded-2xl p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <label htmlFor="poruka" className="text-xs text-muted">
              Tekst / poruka
            </label>
            <textarea
              id="poruka"
              value={poruka}
              onChange={(e) => setPoruka(e.target.value)}
              rows={5}
              placeholder="Unesite tekst — automatski se prikazuje ćirilicom desno..."
              className="border border-line bg-[#F7F8FA] rounded-lg px-3 py-2.5 text-[15px] w-full resize-none"
            />
          </div>
          <div className="flex-1 min-w-0 flex items-center justify-center text-center p-3 min-h-[130px] bg-[#F7F8FA] rounded-xl">
            {poruka.trim() ? (
              <p className="font-display font-bold text-3xl md:text-4xl leading-snug break-words">
                {transliterate(poruka, "cyr")}
              </p>
            ) : (
              <p className="text-muted text-sm">Текст ће се овде приказати ћирилицом.</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-line rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="flex items-center gap-2.5">
            <button
              onClick={objavi}
              disabled={publishing}
              className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {publishing ? "Objavljivanje…" : "Objavi na TV"}
            </button>
            <span className="text-xs text-muted">
              {publishError
                ? "Greška — pokušajte ponovo."
                : transliterate(poruka, "cyr") === objavljenaPoruka && objavljenaPoruka !== ""
                  ? "Objavljeno na TV."
                  : poruka.trim()
                    ? "Ima neobjavljenih izmena."
                    : ""}
            </span>
          </div>

          <div className="flex items-center gap-2.5 md:ml-auto">
            <span className="text-sm font-semibold">СРБИЈА ПОБЕЂУЈЕ на TV</span>
            <button
              onClick={togglePobeda}
              disabled={pobedaSaving}
              role="switch"
              aria-checked={pobeda}
              className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
                pobeda ? "bg-accent" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  pobeda ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="bg-white border border-line rounded-2xl p-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted flex-1 min-w-[160px]">
            Test popuni sva mesta demo brojevima (SNS pobeđuje) i pokaže animaciju 10 sekundi. Reset vraća sve na nulu.
          </span>
          <button
            onClick={pokreniTest}
            disabled={testRunning || resetting}
            className="border border-accent text-accent rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {testRunning ? "Test u toku…" : "Test"}
          </button>
          <button
            onClick={resetSve}
            disabled={testRunning || resetting}
            className="border border-[#D03B3B] text-[#D03B3B] rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {resetting ? "Resetovanje…" : "Reset na nulu"}
          </button>
        </div>

        {visibleRows.map((r) => {
          const glasaloNum = Number(r.glasalo) || 0;
          const sumNum = (Number(r.sns) || 0) + (Number(r.student) || 0) + (Number(r.nevazeci) || 0);
          const mismatch = glasaloNum > 0 && sumNum > 0 && sumNum !== glasaloNum;
          return (
            <div key={r.broj} className="bg-white border border-line rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center gap-2.5 flex-wrap">
                <span className="font-bold text-[15px]">Biračko mesto {r.broj}</span>
                <span
                  className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
                    r.unet ? "bg-[#E4F5EE] text-good" : "bg-[#EEF0F2] text-muted"
                  }`}
                >
                  {r.unet ? "Uneto ✓" : "Nije uneto"}
                </span>
              </div>

              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                {([
                  ["upisani", "Upisani birači"],
                  ["glasalo", "Broj glasalih"],
                  ["sns", "SNS"],
                  ["student", "Studentska lista"],
                  ["nevazeci", "Nevažeći glasovi"],
                ] as [keyof RowDraft, string][]).map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-muted">{label}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={r[key] as string}
                      onChange={(e) => updateField(r.broj, key, e.target.value)}
                      className="font-mono tabular-nums border border-line bg-[#F7F8FA] rounded-lg px-2.5 py-2 text-[15px] w-full"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center gap-2.5 flex-wrap">
                {mismatch ? (
                  <span className="text-xs text-[#b4650f] bg-[#fdeedd] rounded-lg px-2.5 py-1.5">
                    Zbir SNS + Studentska lista + nevažeći ({sumNum}) se ne poklapa sa brojem glasalih ({glasaloNum}).
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2.5 ml-auto">
                  <span className="text-xs text-muted">
                    {saveError === r.broj
                      ? "Greška — pokušajte ponovo."
                      : r.updated_at
                        ? `Sačuvano ${new Date(r.updated_at).toLocaleTimeString("sr-RS")}`
                        : ""}
                  </span>
                  <button
                    onClick={() => obrisi(r.broj)}
                    disabled={saving === r.broj}
                    className="border border-[#D03B3B] text-[#D03B3B] rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                  >
                    Obriši
                  </button>
                  <button
                    onClick={() => save(r.broj)}
                    disabled={saving === r.broj}
                    className="bg-accent text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                  >
                    {saving === r.broj ? "Čuvanje…" : "Sačuvaj"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
