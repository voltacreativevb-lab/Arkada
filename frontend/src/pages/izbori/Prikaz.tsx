import { useEffect, useMemo, useRef, useState } from "react";
import { getIzboriMesta, getIzboriStanje, type BirackoMesto } from "../../lib/api";

const TOTAL = 37;
const SNS = "#163a8c";
const STUDENT = "#d91f2c";
const R = 80;
const C = 2 * Math.PI * R;

/** Animira broj od prethodne do nove vrednosti (ease-out), umesto da skoči. */
function useCountUp(value: number, duration = 800) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

export default function IzboriPrikaz() {
  const [mesta, setMesta] = useState<BirackoMesto[] | null>(null);
  const [poruka, setPoruka] = useState("");
  const [pobeda, setPobeda] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const [{ mesta }, { stanje }] = await Promise.all([getIzboriMesta(), getIzboriStanje()]);
        if (!active) return;
        setMesta(mesta);
        setPoruka(stanje.poruka);
        setPobeda(stanje.pobeda_prikaz);
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

  const izlaznost = stats.upisani > 0 ? (stats.glasalo / stats.upisani) * 100 : 0;
  const nevazeciPct = stats.glasalo > 0 ? (stats.nevazeci / stats.glasalo) * 100 : 0;

  const snsLen = useCountUp(C * stats.snsFrac, 900);
  const studentLen = useCountUp(C * stats.studentFrac, 900);
  const validAnim = useCountUp(stats.valid, 900);
  const snsPctAnim = useCountUp(stats.valid > 0 ? stats.snsFrac * 100 : 0, 900);
  const studentPctAnim = useCountUp(stats.valid > 0 ? stats.studentFrac * 100 : 0, 900);
  const snsVotesAnim = useCountUp(stats.sns, 900);
  const studentVotesAnim = useCountUp(stats.student, 900);
  const upisaniAnim = useCountUp(stats.upisani, 900);
  const glasaloAnim = useCountUp(stats.glasalo, 900);
  const nevazeciAnim = useCountUp(stats.nevazeci, 900);
  const izlaznostAnim = useCountUp(izlaznost, 900);
  const nevazeciPctAnim = useCountUp(nevazeciPct, 900);

  return (
    <div className="min-h-screen bg-[#f4f6fa] text-[#15192b] font-sans flex flex-col">
      <style>{`
        .arc { transition: stroke-dasharray 900ms cubic-bezier(.22,1,.36,1); }
        @keyframes pobedaStripes { from { background-position: 0 0; } to { background-position: 160px 0; } }
        @keyframes pobedaPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes pobedaGlow {
          0%, 100% { text-shadow: 0 0 36px rgba(217,31,44,.55), 0 0 90px rgba(22,58,140,.45); }
          50% { text-shadow: 0 0 64px rgba(217,31,44,.9), 0 0 130px rgba(22,58,140,.75); }
        }
        @keyframes pobedaIn { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
        .pobeda-bg { animation: pobedaStripes 6s linear infinite; }
        .pobeda-text { animation: pobedaPulse 2.4s ease-in-out infinite, pobedaGlow 2.4s ease-in-out infinite; }
        .pobeda-overlay { animation: pobedaIn 500ms cubic-bezier(.22,1,.36,1); }
        @media (prefers-reduced-motion: reduce) {
          .arc { transition: none }
          .pobeda-bg, .pobeda-text, .pobeda-overlay { animation: none }
        }
      `}</style>

      {pobeda && (
        <div
          className="pobeda-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
          style={{ background: `linear-gradient(160deg, #0d2456, ${SNS})` }}
        >
          <div
            className="pobeda-bg absolute inset-0 opacity-25"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, ${STUDENT} 0 18px, transparent 18px 36px, #fff 36px 54px, transparent 54px 72px)`,
              backgroundSize: "160px 160px",
            }}
          />
          <h2
            className="pobeda-text relative font-display font-extrabold text-white text-center px-6 leading-none"
            style={{ fontSize: "clamp(2.8rem, 11vw, 9rem)", letterSpacing: "0.02em" }}
          >
            СРБИЈА
            <br />
            ПОБЕЂУЈЕ
          </h2>
        </div>
      )}

      <div className="h-[7px] w-full flex shrink-0" aria-hidden="true">
        <div className="flex-1" style={{ background: SNS }} />
        <div className="flex-1 bg-white" />
        <div className="flex-1" style={{ background: STUDENT }} />
      </div>

      <header className="shrink-0 text-white" style={{ background: `linear-gradient(135deg, ${SNS}, #0d2456)` }}>
        <div className="flex justify-between items-end gap-4 flex-wrap px-5 md:px-10 py-5">
          <div>
            <div className="font-display font-semibold text-xs tracking-[0.18em] uppercase text-white/70">
              Резултати избора · 37 бирачких места
            </div>
            <h1 className="font-display font-extrabold text-2xl md:text-[38px] mt-1 leading-tight">
              Изборни штаб СНС Врњачка Бања
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div
              className="flex items-center gap-2 font-display font-bold text-sm tracking-[0.14em] uppercase px-3 py-1 rounded-full"
              style={{ background: STUDENT }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              Уживо
            </div>
            <div className="font-mono text-sm text-white/70 tabular-nums">
              Ажурирано {now.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-6 flex-1 px-5 md:px-10 py-6">
        {poruka.trim() && (
          <div
            className="bg-white rounded-2xl px-6 py-5 shadow-[0_4px_24px_rgba(22,58,140,0.08)] border-l-4 text-center"
            style={{ borderColor: STUDENT }}
          >
            <p
              className="font-display font-bold leading-snug break-words"
              style={{ fontSize: "clamp(1.5rem, 4vw, 2.75rem)", color: SNS }}
            >
              {poruka}
            </p>
          </div>
        )}

        <div className="flex gap-7 flex-wrap items-stretch">
          <div
            className="flex-1 min-w-[380px] bg-white rounded-[20px] p-7 flex flex-col items-center gap-4.5 shadow-[0_4px_24px_rgba(22,58,140,0.08)] border-t-4"
            style={{ borderColor: SNS }}
          >
            <div className="relative w-[min(360px,72vw)] aspect-square">
              <svg viewBox="0 0 200 200" className="w-full h-full">
                <circle cx="100" cy="100" r={R} fill="none" stroke="#e7eaf0" strokeWidth="28" />
                <circle
                  className="arc"
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={SNS}
                  strokeWidth="28"
                  strokeLinecap="round"
                  strokeDasharray={`${snsLen.toFixed(2)} ${(C - snsLen).toFixed(2)}`}
                  transform="rotate(-90 100 100)"
                />
                <circle
                  className="arc"
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={STUDENT}
                  strokeWidth="28"
                  strokeLinecap="round"
                  strokeDasharray={`${studentLen.toFixed(2)} ${(C - studentLen).toFixed(2)}`}
                  strokeDashoffset={-snsLen}
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <div
                  className="font-mono font-bold tabular-nums leading-none"
                  style={{ color: SNS, fontSize: "clamp(2.5rem, 7vw, 4.5rem)" }}
                >
                  {Math.round(validAnim).toLocaleString("sr-RS")}
                </div>
                <div className="font-display text-sm tracking-[0.14em] uppercase text-[#7a8294] mt-2">
                  пренетих гласова
                </div>
              </div>
            </div>

            <div className="w-full flex flex-col gap-2.5">
              <div className="flex items-center gap-3 bg-[#eef1f9] rounded-xl px-4 py-3.5">
                <span className="w-5 h-5 rounded shrink-0" style={{ background: SNS }} />
                <span className="font-bold text-lg flex-1 min-w-0">СНС</span>
                <span
                  className="font-mono font-bold tabular-nums"
                  style={{ color: SNS, fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
                >
                  {snsPctAnim.toFixed(1)}%
                </span>
                <span className="font-mono text-sm text-[#7a8294] tabular-nums min-w-[80px] text-right">
                  {Math.round(snsVotesAnim).toLocaleString("sr-RS")}
                </span>
              </div>
              <div className="flex items-center gap-3 bg-[#fbebec] rounded-xl px-4 py-3.5">
                <span className="w-5 h-5 rounded shrink-0" style={{ background: STUDENT }} />
                <span className="font-bold text-lg flex-1 min-w-0">Студентска листа</span>
                <span
                  className="font-mono font-bold tabular-nums"
                  style={{ color: STUDENT, fontSize: "clamp(1.75rem, 4vw, 3rem)" }}
                >
                  {studentPctAnim.toFixed(1)}%
                </span>
                <span className="font-mono text-sm text-[#7a8294] tabular-nums min-w-[80px] text-right">
                  {Math.round(studentVotesAnim).toLocaleString("sr-RS")}
                </span>
              </div>
            </div>
            <p className="text-sm text-[#7a8294] text-center max-w-[340px]">
              Проценти су рачунати у односу на важеће гласове (СНС + Студентска листа), без неважећих.
            </p>
          </div>

          <div className="flex-1 min-w-[380px] grid grid-cols-2 gap-3.5 content-start">
            <div
              className="col-span-2 bg-white rounded-2xl px-6 py-5 flex flex-col gap-1.5 shadow-[0_4px_24px_rgba(22,58,140,0.08)] border-l-4"
              style={{ borderColor: STUDENT }}
            >
              <div className="font-display text-sm tracking-[0.1em] uppercase text-[#7a8294]">
                Обрађено бирачких места
              </div>
              <div
                className="font-mono font-bold tabular-nums"
                style={{ color: SNS, fontSize: "clamp(3rem, 8vw, 5.5rem)" }}
              >
                {stats.done} / {TOTAL}
              </div>
              <div className="text-base text-[#7a8294]">
                {Math.round((stats.done / TOTAL) * 100)}% бирачких места пребројано
              </div>
            </div>
            <div className="bg-white rounded-2xl px-6 py-5 flex flex-col gap-1.5 shadow-[0_4px_24px_rgba(22,58,140,0.08)]">
              <div className="font-display text-sm tracking-[0.1em] uppercase text-[#7a8294]">Уписаних бирача</div>
              <div className="font-mono font-bold tabular-nums" style={{ fontSize: "clamp(1.8rem, 4.5vw, 3rem)" }}>
                {Math.round(upisaniAnim).toLocaleString("sr-RS")}
              </div>
            </div>
            <div className="bg-white rounded-2xl px-6 py-5 flex flex-col gap-1.5 shadow-[0_4px_24px_rgba(22,58,140,0.08)]">
              <div className="font-display text-sm tracking-[0.1em] uppercase text-[#7a8294]">Изашло да гласа</div>
              <div className="font-mono font-bold tabular-nums" style={{ fontSize: "clamp(1.8rem, 4.5vw, 3rem)" }}>
                {Math.round(glasaloAnim).toLocaleString("sr-RS")}
              </div>
              <div className="text-base text-[#7a8294]">{izlaznostAnim.toFixed(1)}% излазност</div>
            </div>
            <div className="col-span-2 bg-white rounded-2xl px-6 py-5 flex flex-col gap-1.5 shadow-[0_4px_24px_rgba(22,58,140,0.08)]">
              <div className="font-display text-sm tracking-[0.1em] uppercase text-[#7a8294]">Неважећи гласови</div>
              <div className="font-mono font-bold tabular-nums" style={{ fontSize: "clamp(1.8rem, 4.5vw, 3rem)" }}>
                {Math.round(nevazeciAnim).toLocaleString("sr-RS")}
              </div>
              <div className="text-base text-[#7a8294]">{nevazeciPctAnim.toFixed(1)}% од гласалих</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-baseline gap-2.5 flex-wrap">
            <span className="font-display text-sm tracking-[0.1em] uppercase text-[#7a8294]">Бирачка места</span>
            <span className="font-display text-sm tracking-[0.1em] uppercase text-[#7a8294]">
              {stats.done} / {TOTAL} пребројано
            </span>
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))" }}>
            {stats.cells.map((c) => (
              <div
                key={c.broj}
                title={`Бирачко место ${c.broj} — ${c.unet ? "уписано" : "чека податке"}`}
                className="relative aspect-square rounded-lg flex items-center justify-center font-mono text-[13px] font-semibold border"
                style={
                  c.unet
                    ? { background: SNS, borderColor: SNS, color: "#fff" }
                    : { background: "#fff", borderColor: "#e4e7ef", color: "#9aa2b3" }
                }
              >
                {c.broj}
                {c.unet && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: STUDENT }}
                  >
                    <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                      <path d="M2.5 6.2L5 8.7L9.5 3.5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
