import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

type Step = "lozinka" | "enroll" | "verify";

export default function AdminPrijava() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("lozinka");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.currentLevel === "aal2") navigate("/admin/red");
    });
  }, [navigate]);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      const verified = factors.totp.find((f) => f.status === "verified");
      if (verified) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verified.id });
        if (challengeError) throw challengeError;
        setFactorId(verified.id);
        void challenge;
        setStep("verify");
      } else {
        const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
        if (enrollError) throw enrollError;
        setFactorId(enrolled.id);
        setQr(enrolled.totp.qr_code);
        setSecret(enrolled.totp.secret);
        setStep("enroll");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška pri prijavi");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (step === "enroll") {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
        if (verifyError) throw verifyError;
      } else {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
        if (verifyError) throw verifyError;
      }
      navigate("/admin/red");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pogrešan kod");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#16191D] p-6">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm">
        <h1 className="font-display font-extrabold text-2xl m-0 text-center">MaestroVolta</h1>
        <p className="text-sm text-muted mt-1 mb-6 text-center">Admin prijava</p>

        {step === "lozinka" && (
          <form onSubmit={handlePassword} className="flex flex-col gap-3.5">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 px-3.5 border border-line rounded-[10px] text-base"
            />
            <input
              type="password"
              placeholder="Lozinka"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 px-3.5 border border-line rounded-[10px] text-base"
            />
            {error && <p className="text-red-600 text-sm m-0">{error}</p>}
            <button type="submit" disabled={submitting} className="h-12 rounded-[10px] bg-accent text-white font-semibold disabled:opacity-50">
              {submitting ? "Prijava…" : "Dalje"}
            </button>
          </form>
        )}

        {step === "enroll" && (
          <form onSubmit={handleVerify} className="flex flex-col gap-3.5">
            <p className="text-sm text-muted m-0">
              Skenirajte QR kod aplikacijom za dvostepenu prijavu (Google Authenticator, Authy i sl.), zatim unesite kod sa 6 cifara.
            </p>
            {qr && <img src={qr} alt="QR kod za MFA" className="mx-auto w-40 h-40" />}
            {secret && <p className="text-xs text-muted text-center break-all">Ili ručno: {secret}</p>}
            <input
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              className="h-12 px-3.5 border border-line rounded-[10px] text-base text-center tracking-[0.3em] font-display"
            />
            {error && <p className="text-red-600 text-sm m-0">{error}</p>}
            <button type="submit" disabled={submitting} className="h-12 rounded-[10px] bg-accent text-white font-semibold disabled:opacity-50">
              {submitting ? "Potvrda…" : "Potvrdi i uključi MFA"}
            </button>
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={handleVerify} className="flex flex-col gap-3.5">
            <p className="text-sm text-muted m-0">Unesite kod iz aplikacije za dvostepenu prijavu.</p>
            <input
              inputMode="numeric"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              autoFocus
              className="h-12 px-3.5 border border-line rounded-[10px] text-base text-center tracking-[0.3em] font-display"
            />
            {error && <p className="text-red-600 text-sm m-0">{error}</p>}
            <button type="submit" disabled={submitting} className="h-12 rounded-[10px] bg-accent text-white font-semibold disabled:opacity-50">
              {submitting ? "Provera…" : "Prijavi se"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
