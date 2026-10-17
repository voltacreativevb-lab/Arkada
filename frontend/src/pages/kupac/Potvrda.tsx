import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { getPorudzbinaStatus } from "../../lib/api";

type Info = Awaited<ReturnType<typeof getPorudzbinaStatus>>["porudzbina"];

/** Draws a shareable "receipt" card (code + QR + order summary) onto an offscreen canvas. */
async function buildReceiptImage(kod: string, qrDataUrl: string, info: Info | null): Promise<Blob> {
  const width = 640;
  const height = 860;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#EEF0F2";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(24, 24, width - 48, height - 48);

  ctx.fillStyle = "#1E6B45";
  ctx.beginPath();
  ctx.arc(70, 76, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(62, 76);
  ctx.lineTo(68, 83);
  ctx.lineTo(80, 68);
  ctx.stroke();

  ctx.fillStyle = "#16191D";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("Porudžbina je kreirana", 98, 76);

  ctx.textAlign = "center";
  ctx.fillStyle = "#3F454C";
  ctx.font = "15px system-ui, sans-serif";
  ctx.fillText("Pokažite ovaj kod na kasi", width / 2, 150);

  ctx.fillStyle = "#16191D";
  ctx.font = "800 64px system-ui, sans-serif";
  ctx.fillText(kod, width / 2, 220);

  const qrImg = new Image();
  await new Promise<void>((resolve) => {
    qrImg.onload = () => resolve();
    qrImg.src = qrDataUrl;
  });
  const qrSize = 260;
  ctx.drawImage(qrImg, (width - qrSize) / 2, 270, qrSize, qrSize);

  let y = 580;
  ctx.strokeStyle = "#E3E6EA";
  ctx.beginPath();
  ctx.moveTo(56, y);
  ctx.lineTo(width - 56, y);
  ctx.stroke();
  y += 50;

  ctx.textAlign = "left";
  ctx.font = "15px system-ui, sans-serif";
  if (info) {
    ctx.fillStyle = "#3F454C";
    ctx.fillText("Proizvod", 56, y);
    ctx.fillStyle = "#16191D";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${info.modeli.proizvodi.naziv} · ${info.modeli.naziv}`, width - 56, y);
    y += 38;

    ctx.textAlign = "left";
    ctx.fillStyle = "#3F454C";
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText("Za plaćanje na kasi", 56, y);
    ctx.fillStyle = "#16191D";
    ctx.font = "800 22px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${info.cena} din`, width - 56, y);
    y += 50;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#4A3B00";
  ctx.font = "13px system-ui, sans-serif";
  wrapCanvasText(ctx, "Neplaćena porudžbina se automatski poništava posle 48 sati.", width / 2, y, width - 140, 18);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

export default function Potvrda() {
  const { slug, kod } = useParams<{ slug: string; kod: string }>();
  const [qr, setQr] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!kod) return;
    getPorudzbinaStatus(kod)
      .then((r) => setInfo(r.porudzbina))
      .catch((e) => setError(e.message));
    QRCode.toDataURL(kod, { margin: 1, width: 260, color: { dark: "#16191D", light: "#FFFFFF" } }).then(setQr);
  }, [kod]);

  async function handleSaveToGallery() {
    if (!kod || !qr) return;
    setSaveMsg(null);
    setSaving(true);
    try {
      const blob = await buildReceiptImage(kod, qr, info);
      const file = new File([blob], `porudzbina-${kod}.png`, { type: "image/png" });

      // Web Share with a file opens the native share sheet, where "Save Image" goes straight to the phone's gallery.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Porudžbina ${kod}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `porudzbina-${kod}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setSaveMsg("Slika je preuzeta.");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") setSaveMsg("Nije uspelo čuvanje slike.");
    } finally {
      setSaving(false);
    }
  }

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
        <button
          onClick={handleSaveToGallery}
          disabled={saving || !qr}
          className="h-11 px-5 rounded-xl bg-ink text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4v12m0 0l-4-4m4 4l4-4M5 18h14" />
          </svg>
          {saving ? "Čuvanje…" : "Sačuvaj u galeriju"}
        </button>
        {saveMsg && <span className="text-xs text-muted">{saveMsg}</span>}
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
