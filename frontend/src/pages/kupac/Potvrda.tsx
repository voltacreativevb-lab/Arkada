import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { getPorudzbinaStatus } from "../../lib/api";

export default function Potvrda() {
  const { slug, kod } = useParams<{ slug: string; kod: string }>();
  const [qr, setQr] = useState<string | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getPorudzbinaStatus>>["porudzbina"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kod) return;
    getPorudzbinaStatus(kod)
      .then((r) => setInfo(r.porudzbina))
      .catch((e) => setError(e.message));
    QRCode.toDataURL(kod, { margin: 1, width: 160, color: { dark: "#16191D", light: "#FFFFFF" } }).then(setQr);
  }, [kod]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEF0F2] p-6 text-center">
        <p className="text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink flex flex-col">
      <header className="px-5 py-4 bg-white border-b border-line flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-full bg-good flex items-center justify-center shrink-0">
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="text-base font-semibold">Porudžbina je kreirana</span>
      </header>

      <section className="mx-5 mt-5 px-5 py-6 bg-white border border-line rounded-2xl flex flex-col items-center gap-3.5">
        <span className="text-sm text-[#3F454C]">Pokažite ovaj kod na kasi</span>
        <span className="font-display font-extrabold text-[46px] tracking-widest">{kod}</span>
        {qr && <img src={qr} alt={`QR kod porudžbine ${kod}`} width={150} height={150} />}
      </section>

      {info && (
        <section className="mx-5 mt-4 p-4 bg-white border border-line rounded-xl flex flex-col gap-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-[#3F454C]">Proizvod</span>
            <span className="font-semibold">
              {info.modeli.proizvodi.naziv} · {info.modeli.naziv}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#3F454C]">Tekst</span>
            <span className="font-semibold">{Object.values(info.polja).filter(Boolean).join(" · ")}</span>
          </div>
          <div className="h-px bg-[#E3E6EA]" />
          <div className="flex justify-between items-baseline">
            <span className="text-[15px] font-semibold">Za plaćanje na kasi</span>
            <span className="font-display font-extrabold text-xl">{info.cena} din</span>
          </div>
        </section>
      )}

      <ol className="mx-5 mt-4 list-none p-0 flex flex-col gap-2.5">
        <li className="flex gap-2.5 text-sm leading-snug">
          <span className="font-bold text-accent">1</span>
          <span>Platite na kasi prodavnice. Radnik potvrđuje uplatu.</span>
        </li>
        <li className="flex gap-2.5 text-sm leading-snug">
          <span className="font-bold text-accent">2</span>
          <span>Dobićete WhatsApp ili Viber poruku sa datumom kada je proizvod spreman.</span>
        </li>
        <li className="flex gap-2.5 text-sm leading-snug">
          <span className="font-bold text-accent">3</span>
          <span>Preuzmite ga u ovoj prodavnici uz isti kod.</span>
        </li>
      </ol>

      <p className="mx-5 mt-4 px-3.5 py-3 rounded-[10px] bg-warn text-warn-fg text-[13px]">
        Neplaćena porudžbina se automatski poništava posle 48 sati.
      </p>

      <Link
        to={`/status/${kod}`}
        className="mx-5 mt-4 mb-6 h-[50px] rounded-xl border border-accent text-accent font-semibold text-[15px] flex items-center justify-center no-underline"
      >
        Prati porudžbinu
      </Link>
    </div>
  );
}
