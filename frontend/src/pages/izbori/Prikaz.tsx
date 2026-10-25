import { useEffect, useMemo, useState } from "react";
import { getIzboriMesta, type BirackoMesto } from "../../lib/api";

const TOTAL = 37;
const SNS = "#2a6fd6";
const STUDENT = "#eb6834";
const R = 80;
const C = 2 * Math.PI * R;

export default function IzboriPrikaz() {
  const [mesta, setMesta] = useState<BirackoMesto[] | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const { mesta } = await getIzboriMesta();
        if (active) setMesta(mesta);
      } catch {
        // tiha greška — sledeći poll pokušava ponovo
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const byBroj = new Map((mesta ?? []).map((m) => [m.broj, m]));
    let upisani = 0,
      glasalo = 0,
      sns = 0,
      student = 0,
      nevazeci = 0,
      done = 0;
    const cells: { broj: number; unet: boolean }[] = [];
    for (let i = 1; i <= TOTAL; i++) {
      const m = byBroj.get(i);
      const unet = !!m?.unet;
      cells.push({ broj: i, unet });
      if (unet && m) {
        done++;
        upisani += m.upisani;
        glasalo += m.glasalo;
        sns += m.sns;
        student += m.student;
        nevazeci += m.nevazeci;
      }
    }
    const valid = sns + student;
    const snsFrac = valid > 0 ? sns / valid : 0;
    const studentFrac = valid > 0 ? student / valid : 0;
    return { upisani, glasalo, sns, student, nevazeci, done, valid, snsFrac, studentFrac, cells };
  }, [mesta]);

  const snsLen = C * stats.snsFrac;
  const studentLen = C * stats.studentFrac;
  const izlaznost = stats.upisani > 0 ? (stats.glasalo / stats.upisani) * 100 : 0;
  const nevazeciPct = stats.glasalo > 0 ? (stats.nevazeci / stats.glasalo) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-[#f4f6fa] font-sans flex flex-col gap-5 px-5 py-6 md:px-10">
      <header className="flex justify-between items-end gap-4 flex-wrap border-b border-[#242b39] pb-4">
        <div>
          <div className="font-display font-semibold text-xs tracking-[0.14em] uppercase text-[#8d97ab]">
            Izborni rezultati · 37 biračkih mesta
          </div>
          <h1 className="font-display font-extrabold text-3xl md:text-[46px] mt-1">Pregled rezultata</h1>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2 font-display font-semibold text-sm tracking-[0.12em] uppercase text-[#e34948]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#e34948] animate-pulse" />
            Uživo
          </div>
          <div className="font-mono text-sm text-[#8d97ab] tabular-nums">
            Ažurirano {now.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-6 flex-1">
        <div className="flex gap-7 flex-wrap items-stretch">
          <div className="flex-1 min-w-[380px] bg-[#12161f] border border-[#242b39] rounded-[20px] p-7 flex flex-col items-center gap-4.5">
            <div className="relative w-[min(340px,70vw)] aspect-square">
              <svg viewBox="0 0 200 200" className="w-full h-full">
                <circle cx="100" cy="100" r={R} fill="none" stroke="#242b39" strokeWidth="28" />
                <circle
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={SNS}
                  strokeWidth="28"
                  strokeDasharray={`${snsLen.toFixed(2)} ${(C - snsLen).toFixed(2)}`}
                  transform="rotate(-90 100 100)"
                />
                <circle
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={STUDENT}
                  strokeWidth="28"
                  strokeDasharray={`${studentLen.toFixed(2)} ${(C - studentLen).toFixed(2)}`}
                  strokeDashoffset={-snsLen}
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <div className="font-mono font-semibold text-3xl md:text-[44px] tabular-nums leading-none">
                  {stats.valid.toLocaleString("sr-RS")}
                </div>
                <div className="font-display text-xs tracking-[0.12em] uppercase text-[#8d97ab] mt-1.5">
                  prenetih glasova
                </div>
              </div>
            </div>

            <div className="w-full flex flex-col gap-2.5">
              <div className="flex items-center gap-3 bg-[#171c27] rounded-xl px-3.5 py-2.5">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: SNS }} />
                <span className="font-semibold text-[15px] flex-1 min-w-0">SNS</span>
                <span className="font-mono font-semibold text-xl tabular-nums">
                  {(stats.valid > 0 ? stats.snsFrac * 100 : 0).toFixed(1)}%
                </span>
                <span className="font-mono text-xs text-[#8d97ab] tabular-nums min-w-[70px] text-right">
                  {stats.sns.toLocaleString("sr-RS")}
                </span>
              </div>
              <div className="flex items-center gap-3 bg-[#171c27] rounded-xl px-3.5 py-2.5">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: STUDENT }} />
                <span className="font-semibold text-[15px] flex-1 min-w-0">Studentska lista</span>
                <span className="font-mono font-semibold text-xl tabular-nums">
                  {(stats.valid > 0 ? stats.studentFrac * 100 : 0).toFixed(1)}%
                </span>
                <span className="font-mono text-xs text-[#8d97ab] tabular-nums min-w-[70px] text-right">
                  {stats.student.toLocaleString("sr-RS")}
                </span>
              </div>
            </div>
            <p className="text-xs text-[#8d97ab] text-center max-w-[320px]">
              Procenti su računati u odnosu na važne glasove (SNS + Studentska lista), bez nevažećih.
            </p>
          </div>

          <div className="flex-1 min-w-[380px] grid grid-cols-2 gap-3.5 content-start">
            <div className="col-span-2 bg-[#12161f] border border-[#242b39] rounded-2xl px-5 py-4.5 flex flex-col gap-1.5">
              <div className="font-display text-xs tracking-[0.1em] uppercase text-[#8d97ab]">
                Obrađeno biračkih mesta
              </div>
              <div className="font-mono font-semibold text-2xl md:text-3xl tabular-nums text-[#39c590]">
                {stats.done} / {TOTAL}
              </div>
              <div className="text-[13px] text-[#8d97ab]">
                {Math.round((stats.done / TOTAL) * 100)}% biračkih mesta prebrojano
              </div>
            </div>
            <div className="bg-[#12161f] border border-[#242b39] rounded-2xl px-5 py-4.5 flex flex-col gap-1.5">
              <div className="font-display text-xs tracking-[0.1em] uppercase text-[#8d97ab]">Upisanih birača</div>
              <div className="font-mono font-semibold text-2xl md:text-3xl tabular-nums">
                {stats.upisani.toLocaleString("sr-RS")}
              </div>
            </div>
            <div className="bg-[#12161f] border border-[#242b39] rounded-2xl px-5 py-4.5 flex flex-col gap-1.5">
              <div className="font-display text-xs tracking-[0.1em] uppercase text-[#8d97ab]">Izašlo da glasa</div>
              <div className="font-mono font-semibold text-2xl md:text-3xl tabular-nums">
                {stats.glasalo.toLocaleString("sr-RS")}
              </div>
              <div className="text-[13px] text-[#8d97ab]">{izlaznost.toFixed(1)}% izlaznost</div>
            </div>
            <div className="col-span-2 bg-[#12161f] border border-[#242b39] rounded-2xl px-5 py-4.5 flex flex-col gap-1.5">
              <div className="font-display text-xs tracking-[0.1em] uppercase text-[#8d97ab]">Nevažeći glasovi</div>
              <div className="font-mono font-semibold text-2xl md:text-3xl tabular-nums">
                {stats.nevazeci.toLocaleString("sr-RS")}
              </div>
              <div className="text-[13px] text-[#8d97ab]">{nevazeciPct.toFixed(1)}% od glasalih</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-baseline gap-2.5 flex-wrap">
            <span className="font-display text-[13px] tracking-[0.1em] uppercase text-[#8d97ab]">
              Biračka mesta
            </span>
            <span className="font-display text-[13px] tracking-[0.1em] uppercase text-[#8d97ab]">
              {stats.done} / {TOTAL} prebrojano
            </span>
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(38px, 1fr))" }}>
            {stats.cells.map((c) => (
              <div
                key={c.broj}
                title={`Biračko mesto ${c.broj} — ${c.unet ? "uneto" : "čeka podatke"}`}
                className={`aspect-square rounded-lg flex items-center justify-center font-mono text-[13px] font-semibold border ${
                  c.unet ? "bg-[#39c590] border-[#39c590] text-[#06241a]" : "bg-[#12161f] border-[#242b39] text-[#8d97ab]"
                }`}
              >
                {c.broj}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
