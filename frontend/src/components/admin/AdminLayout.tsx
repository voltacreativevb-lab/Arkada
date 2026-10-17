import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const navItems = [
  { to: "/admin/red", label: "Red za izradu" },
  { to: "/admin/prodavnice", label: "Prodavnice" },
];

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-[#EEF0F2] font-sans text-ink flex">
      <aside className="w-56 shrink-0 bg-[#16191D] text-white flex flex-col">
        <div className="px-6 py-5">
          <span className="font-display font-extrabold text-lg">MaestroVolta</span>
          <div className="text-xs text-[#C9CED4] mt-0.5">Proizvodnja</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-white/10 text-white" : "text-[#C9CED4] hover:bg-white/5 hover:text-white"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-5 pt-3 border-t border-white/10">
          <button onClick={() => supabase.auth.signOut()} className="w-full text-left rounded-lg px-3 py-2.5 text-sm text-[#C9CED4] hover:bg-white/5 hover:text-white">
            Odjava
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
