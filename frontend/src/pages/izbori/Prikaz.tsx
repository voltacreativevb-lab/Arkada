import { useEffect, useMemo, useRef, useState } from "react";
import { getIzboriMesta, getIzboriStanje, type BirackoMesto } from "../../lib/api";

const TOTAL = 37;
const SNS = "#163a8c";
const STUDENT = "#d91f2c";
const SPS = "#d4a017";
const R = 80;
const C = 2 * Math.PI * R;

const FLAG_POSITIONS = [
  { top: "5%", left: "6%", delay: "0s" },
  { top: "5%", left: "27%", delay: ".3s" },
  { top: "5%", left: "73%", delay: ".6s" },
  { top: "5%", left: "92%", delay: ".15s" },
  { top: "80%", left: "9%", delay: ".45s" },
  { top: "80%", left: "89%", delay: ".75s" },
];

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
    let sns = 0,
      student = 0,
      sps = 0,
      done = 0;
    const cells: { broj: number; unet: boolean }[] = [];
    for (let i = 1; i <= TOTAL; i++) {
      const m = byBroj.get(i);
      const unet = !!m?.unet;
      cells.push({ broj: i, unet });
      if (unet && m) {
        done++;
        sns += m.sns;
        student += m.student;
        sps += m.sps;
      }
    }
    const ukupno = sns + student + sps;
    const snsFrac = ukupno > 0 ? sns / ukupno : 0;
    const studentFrac = ukupno > 0 ? student / ukupno : 0;
    const spsFrac = ukupno > 0 ? sps / ukupno : 0;
    return { sns, student, sps, done, ukupno, snsFrac, studentFrac, spsFrac, cells };
  }, [mesta]);

  const snsLen = useCountUp(C * stats.snsFrac, 900);
  const studentLen = useCountUp(C * stats.studentFrac, 900);
  const spsLen = useCountUp(C * stats.spsFrac, 900);
  const ukupnoAnim = useCountUp(stats.ukupno, 900);
  const snsPctAnim = useCountUp(stats.ukupno > 0 ? stats.snsFrac * 100 : 0, 900);
  const studentPctAnim = useCountUp(stats.ukupno > 0 ? stats.studentFrac * 100 : 0, 900);
  const spsPctAnim = useCountUp(stats.ukupno > 0 ? stats.spsFrac * 100 : 0, 900);
  const snsVotesAnim = useCountUp(stats.sns, 900);
  const studentVotesAnim = useCountUp(stats.student, 900);
  const spsVotesAnim = useCountUp(stats.sps, 900);

  return (
    <div className="h-screen bg-[#f4f6fa] text-[#15192b] font-sans flex flex-col overflow-hidden">
      <style>{`
        .arc { transition: stroke-dasharray 900ms cubic-bezier(.22,1,.36,1); }
        @keyframes pobedaPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes pobedaGlow {
          0%, 100% { text-shadow: 0 0 36px rgba(217,31,44,.55), 0 0 90px rgba(22,58,140,.45); }
          50% { text-shadow: 0 0 64px rgba(217,31,44,.9), 0 0 130px rgba(22,58,140,.75); }
        }
        @keyframes pobedaIn { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes ringSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes flagWave { 0%, 100% { transform: skewY(-7deg) scaleX(1); } 50% { transform: skewY(7deg) scaleX(.95); } }
        .pobeda-text { animation: pobedaPulse 2.4s ease-in-out infinite, pobedaGlow 2.4s ease-in-out infinite; }
        .pobeda-overlay { animation: pobedaIn 450ms cubic-bezier(.22,1,.36,1); }
        .ring-spin { animation: ringSpin 3s linear infinite; }
        .flag-wave { animation: flagWave 2.1s ease-in-out infinite; transform-origin: 0% 20%; }
        @media (prefers-reduced-motion: reduce) {
          .arc { transition: none }
          .pobeda-text, .pobeda-overlay, .ring-spin, .flag-wave { animation: none }
        }
      `}</style>

      {pobeda && (
        <div className="pobeda-overlay fixed inset-0 z-50 flex items-center justify-center overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(160deg, rgba(13,36,86,.74), rgba(22,58,140,.7))`, backdropFilter: "blur(1px)" }}
          />

          {FLAG_POSITIONS.map((f, i) => (
            <div key={i} className="absolute" style={{ top: f.top, left: f.left }}>
              <div style={{ width: 3, height: "clamp(44px, 8vh, 72px)", background: "#e3c76b", borderRadius: 2 }} />
              <div
                className="flag-wave absolute"
                style={{
                  left: 3,
                  top: 0,
                  width: "clamp(46px, 8vh, 74px)",
                  height: "clamp(30px, 5.3vh, 48px)",
                  background: `linear-gradient(to bottom, ${STUDENT} 0 34%, ${SNS} 34% 67%, #fff 67% 100%)`,
                  boxShadow: "0 3px 10px rgba(0,0,0,.3)",
                  borderRadius: "0 2px 2px 0",
                  animationDelay: f.delay,
                }}
              />
            </div>
          ))}

          <div className="relative flex flex-col items-center gap-3 px-6">
            <div
              className="font-mono font-bold text-white tabular-nums leading-none"
              style={{ fontSize: "clamp(2.2rem, 6.5vh, 4.2rem)" }}
            >
              {now.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="relative flex items-center justify-center" style={{ width: "min(24vh, 210px)", height: "min(24vh, 210px)" }}>
              <div
                className="ring-spin absolute inset-0 rounded-full"
                style={{ background: `conic-gradient(from 0deg, ${STUDENT}, #fff, ${SNS}, ${STUDENT})` }}
              />
              <div className="absolute rounded-full flex items-center justify-center" style={{ inset: 8, background: "#0b1d44" }}>
                <span className="font-display font-extrabold text-white leading-none" style={{ fontSize: "min(13vh, 112px)" }}>
                  1
                </span>
              </div>
            </div>
            <h2
              className="pobeda-text font-display font-extrabold text-white text-center leading-none"
              style={{ fontSize: "clamp(2rem, 7vw, 5.5rem)", letterSpacing: "0.02em" }}
            >
              СРБИЈА
              <br />
              ПОБЕЂУЈЕ
            </h2>
            <p className="font-display font-bold text-white/90 text-center" style={{ fontSize: "clamp(1.1rem, 3vw, 2rem)" }}>
              Врњачка Бања
            </p>
            <p className="font-display font-bold text-white/90 text-center" style={{ fontSize: "clamp(1.4rem, 3.6vw, 2.4rem)" }}>
              Чекамо прве резултате са бирачких места
            </p>
          </div>
        </div>
      )}

      <div className="h-1.5 w-full flex shrink-0" aria-hidden="true">
        <div className="flex-1" style={{ background: SNS }} />
        <div className="flex-1 bg-white" />
        <div className="flex-1" style={{ background: STUDENT }} />
      </div>

      <header className="shrink-0 text-white" style={{ background: `linear-gradient(135deg, ${SNS}, #0d2456)` }}>
        <div className="flex justify-between items-end gap-4 flex-wrap px-5 md:px-8 py-2.5">
          <div>
            <div className="font-display font-semibold text-[10px] tracking-[0.18em] uppercase text-white/70">
              Резултати избора · 37 бирачких места
            </div>
            <h1 className="font-display font-extrabold text-xl md:text-[28px] mt-0.5 leading-tight">
              Изборни штаб СНС Врњачка Бања
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div
              className="flex items-center gap-2 font-display font-bold text-xs tracking-[0.14em] uppercase px-2.5 py-1 rounded-full"
              style={{ background: STUDENT }}
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Уживо
            </div>
            <div className="font-mono text-xs text-white/70 tabular-nums">
              Ажурирано {now.toLocaleTimeString("sr-RS", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col gap-2.5 px-5 md:px-8 py-2.5 overflow-y-auto">
        {poruka.trim() && (
          <div
            className="shrink-0 bg-white rounded-xl px-5 py-2.5 shadow-[0_4px_24px_rgba(22,58,140,0.08)] border-l-4 text-center"
            style={{ borderColor: STUDENT }}
          >
            <p
              className="font-display font-bold leading-snug break-words"
              style={{ fontSize: "clamp(1.1rem, 3vh, 1.9rem)", color: SNS }}
            >
              {poruka}
            </p>
          </div>
        )}

        <div className="flex-1 min-h-0 flex gap-5 flex-wrap items-stretch">
          <div
            className="flex-1 min-w-[320px] bg-white rounded-2xl p-4 flex flex-col items-center justify-center gap-3 shadow-[0_4px_24px_rgba(22,58,140,0.08)] border-t-4 overflow-hidden"
            style={{ borderColor: SNS }}
          >
            <div className="relative shrink-0" style={{ width: "min(28vh, 260px)", height: "min(28vh, 260px)" }}>
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
                <circle
                  className="arc"
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={SPS}
                  strokeWidth="28"
                  strokeLinecap="round"
                  strokeDasharray={`${spsLen.toFixed(2)} ${(C - spsLen).toFixed(2)}`}
                  strokeDashoffset={-(snsLen + studentLen)}
                  transform="rotate(-90 100 100)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <div
                  className="font-mono font-bold tabular-nums leading-none"
                  style={{ color: SNS, fontSize: "clamp(1.5rem, 4.6vh, 2.4rem)" }}
                >
                  {Math.round(ukupnoAnim).toLocaleString("sr-RS")}
                </div>
                <div className="font-display text-[11px] tracking-[0.14em] uppercase text-[#7a8294] mt-1">
                  пренетих гласова
                </div>
              </div>
            </div>

            <div className="w-full flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-3 bg-[#eef1f9] rounded-xl px-3.5 py-2">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: SNS }} />
                <span className="font-bold text-sm flex-1 min-w-0">СНС</span>
                <span
                  className="font-mono font-bold tabular-nums"
                  style={{ color: SNS, fontSize: "clamp(1.1rem, 3vh, 1.7rem)" }}
                >
                  {snsPctAnim.toFixed(1)}%
                </span>
                <span className="font-mono text-xs text-[#7a8294] tabular-nums min-w-[64px] text-right">
                  {Math.round(snsVotesAnim).toLocaleString("sr-RS")}
                </span>
              </div>
              <div className="flex items-center gap-3 bg-[#fbebec] rounded-xl px-3.5 py-2">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: STUDENT }} />
                <span className="font-bold text-sm flex-1 min-w-0">Студентска листа</span>
                <span
                  className="font-mono font-bold tabular-nums"
                  style={{ color: STUDENT, fontSize: "clamp(1.1rem, 3vh, 1.7rem)" }}
                >
                  {studentPctAnim.toFixed(1)}%
                </span>
                <span className="font-mono text-xs text-[#7a8294] tabular-nums min-w-[64px] text-right">
                  {Math.round(studentVotesAnim).toLocaleString("sr-RS")}
                </span>
              </div>
              <div className="flex items-center gap-3 bg-[#fbf3e0] rounded-xl px-3.5 py-2">
                <span className="w-4 h-4 rounded shrink-0" style={{ background: SPS }} />
                <span className="font-bold text-sm flex-1 min-w-0">СПС</span>
                <span
                  className="font-mono font-bold tabular-nums"
                  style={{ color: SPS, fontSize: "clamp(1.1rem, 3vh, 1.7rem)" }}
                >
                  {spsPctAnim.toFixed(1)}%
                </span>
                <span className="font-mono text-xs text-[#7a8294] tabular-nums min-w-[64px] text-right">
                  {Math.round(spsVotesAnim).toLocaleString("sr-RS")}
                </span>
              </div>
            </div>
          </div>

          <div
            className="flex-1 min-w-[260px] bg-white rounded-2xl px-6 py-5 flex flex-col items-center justify-center gap-1.5 shadow-[0_4px_24px_rgba(22,58,140,0.08)] border-l-4"
            style={{ borderColor: STUDENT }}
          >
            <div className="font-display text-sm tracking-[0.1em] uppercase text-[#7a8294]">
              Обрађено бирачких места
            </div>
            <div
              className="font-mono font-bold tabular-nums leading-none"
              style={{ color: SNS, fontSize: "clamp(3.5rem, 11vh, 7rem)" }}
            >
              {stats.done} / {TOTAL}
            </div>
            <div className="text-base text-[#7a8294]">
              {Math.round((stats.done / TOTAL) * 100)}% бирачких места пребројано
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-col gap-1">
          <div className="flex justify-between items-baseline gap-2.5 flex-wrap">
            <span className="font-display text-xs tracking-[0.1em] uppercase text-[#7a8294]">Бирачка места</span>
            <span className="font-display text-xs tracking-[0.1em] uppercase text-[#7a8294]">
              {stats.done} / {TOTAL} пребројано
            </span>
          </div>
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${TOTAL}, minmax(0, 1fr))`, height: "clamp(40px, 7vh, 64px)" }}
          >
            {stats.cells.map((c) => (
              <div
                key={c.broj}
                className="relative h-full rounded-md flex items-center justify-center font-mono text-[11px] font-semibold border"
                style={
                  c.unet
                    ? { background: SNS, borderColor: SNS, color: "#fff" }
                    : { background: "#fff", borderColor: "#e4e7ef", color: "#9aa2b3" }
                }
              >
                {c.broj}
                {c.unet && (
                  <span
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                    style={{ background: STUDENT }}
                  >
                    <svg viewBox="0 0 12 12" className="w-2 h-2">
                      <path d="M2.5 6.2L5 8.7L9.5 3.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
