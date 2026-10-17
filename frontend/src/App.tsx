import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Main from "./pages/kupac/Main";
import Konfigurator from "./pages/kupac/Konfigurator";
import Potvrda from "./pages/kupac/Potvrda";
import Status from "./pages/kupac/Status";
import RadnikPrijava from "./pages/radnik/Prijava";
import RadnikPanel from "./pages/radnik/Panel";
import AdminPrijava from "./pages/admin/Prijava";
import AdminRed from "./pages/admin/Red";

function Pocetna() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#EEF0F2] p-8 text-center">
      <div>
        <h1 className="font-display font-extrabold text-2xl mb-2">MaestroVolta</h1>
        <p className="text-muted text-sm">Skenirajte QR kod u prodavnici da počnete personalizaciju.</p>
      </div>
    </div>
  );
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ok" | "no">("loading");

  useEffect(() => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setStatus(data?.currentLevel === "aal2" ? "ok" : "no");
    });
  }, []);

  if (status === "loading") return null;
  if (status === "no") return <Navigate to="/admin/prijava" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Pocetna />} />
      <Route path="/status" element={<Status />} />
      <Route path="/status/:kod" element={<Status />} />

      <Route path="/prodavnica/:slug" element={<RadnikPrijava />} />
      <Route path="/prodavnica/:slug/panel" element={<RadnikPanel />} />

      <Route path="/admin" element={<Navigate to="/admin/red" replace />} />
      <Route path="/admin/prijava" element={<AdminPrijava />} />
      <Route
        path="/admin/red"
        element={
          <AdminGuard>
            <AdminRed />
          </AdminGuard>
        }
      />

      <Route path="/:slug/konfigurator/:proizvodId" element={<Konfigurator />} />
      <Route path="/:slug/potvrda/:kod" element={<Potvrda />} />
      <Route path="/:slug" element={<Main />} />
    </Routes>
  );
}
