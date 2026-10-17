import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { radnikPrijava } from "../../lib/api";
import { saveWorkerSession } from "../../lib/workerSession";

export default function RadnikPrijava() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setError(null);
    setSubmitting(true);
    try {
      const { token, radnik, prodavnica } = await radnikPrijava(slug, pin);
      saveWorkerSession(token, { radnik, prodavnica: { ...prodavnica, slug } });
      navigate(`/prodavnica/${slug}/panel`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri prijavi");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#16191D] p-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 w-full max-w-sm flex flex-col gap-5">
        <div className="text-center">
          <h1 className="font-display font-extrabold text-2xl m-0">MaestroVolta</h1>
          <p className="text-sm text-muted mt-1">Unesite PIN prodavnice</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className="h-16 text-center text-3xl tracking-[0.3em] border-2 border-accent rounded-xl font-display font-bold"
        />
        {error && <p className="text-red-600 text-sm text-center m-0">{error}</p>}
        <button
          type="submit"
          disabled={submitting || pin.length < 4}
          className="h-14 rounded-xl bg-accent text-white font-bold text-base disabled:opacity-50"
        >
          {submitting ? "Prijava…" : "Prijavi se"}
        </button>
      </form>
    </div>
  );
}
