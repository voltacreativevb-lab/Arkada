import type { PoljeDef, SablonConfig } from "@maestrovolta/sablon-core";
import { getWorkerToken } from "./workerSession";
import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface Prodavnica {
  naziv: string;
  grad: string;
  adresa: string | null;
  radno_vreme: string | null;
}

export interface Model {
  id: string;
  naziv: string;
  kod: string;
  cena: number | null;
  sablon_config: SablonConfig;
  polja: PoljeDef[];
  slika_pregled: string | null;
}

export interface Proizvod {
  id: string;
  naziv: string;
  slug: string;
  opis: string | null;
  osnovna_cena: number;
  slike: string[];
  modeli: Model[];
}

async function handle<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : JSON.stringify(body.error));
  return body;
}

// ---------- Javne rute (kupac) ----------

export async function getProdavnica(slug: string) {
  const res = await fetch(`${API_URL}/prodavnice/${slug}`);
  return handle<{ prodavnica: Prodavnica }>(res);
}

export async function getKatalog(slug: string) {
  const res = await fetch(`${API_URL}/prodavnice/${slug}/proizvodi`);
  return handle<{ prodavnica_id: string; proizvodi: Proizvod[] }>(res);
}

export interface OrderFieldInput {
  key: string;
  value: string;
  x?: number;
  y?: number;
  sizeMm?: number;
}

export async function createPorudzbina(input: {
  prodavnica_slug: string;
  model_id: string;
  pismo: "lat" | "cyr";
  font: string;
  polja: OrderFieldInput[];
  telefon_kupca?: string;
  kanal_obavestavanja?: "whatsapp" | "viber";
}) {
  const res = await fetch(`${API_URL}/porudzbine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return handle<{ porudzbina: { kod: string; cena: number; status: string; istice_u: string } }>(res);
}

export async function getPorudzbinaStatus(kod: string) {
  const res = await fetch(`${API_URL}/porudzbine/${kod}`);
  return handle<{
    porudzbina: {
      kod: string;
      status: string;
      cena: number;
      polja: Record<string, string>;
      istice_u: string | null;
      created_at: string;
      prodavnice: Prodavnica;
      modeli: { naziv: string; proizvodi: { naziv: string } };
    };
    istorija: { status: string; created_at: string }[];
  }>(res);
}

// ---------- Radnik ----------

export async function radnikPrijava(slug: string, pin: string) {
  const res = await fetch(`${API_URL}/prodavnice/${slug}/radnik/prijava`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  return handle<{ token: string; radnik: { id: string; ime: string }; prodavnica: { id: string; naziv: string } }>(res);
}

function workerFetch(path: string, init?: RequestInit) {
  const token = getWorkerToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

export interface RadnikPorudzbina {
  kod: string;
  status: string;
  cena: number;
  polja: Record<string, string>;
  telefon_kupca: string | null;
  created_at: string;
  modeli: { naziv: string; proizvodi: { naziv: string } };
}

export async function getRadnikPorudzbine() {
  return handle<{ porudzbine: RadnikPorudzbina[] }>(await workerFetch("/radnik/porudzbine"));
}

export async function radnikNaplaceno(kod: string) {
  return handle<{ ok: true }>(await workerFetch(`/radnik/porudzbine/${kod}/naplaceno`, { method: "POST" }));
}

export async function radnikPrimljeno(kod: string) {
  return handle<{ ok: true }>(await workerFetch(`/radnik/porudzbine/${kod}/primljeno`, { method: "POST" }));
}

export async function radnikPreuzeto(kod: string) {
  return handle<{ ok: true }>(await workerFetch(`/radnik/porudzbine/${kod}/preuzeto`, { method: "POST" }));
}

export async function radnikOtkazi(kod: string) {
  return handle<{ ok: true }>(await workerFetch(`/radnik/porudzbine/${kod}/otkazi`, { method: "POST" }));
}

// ---------- Admin ----------

async function adminFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      // FormData bodies must NOT get an explicit Content-Type — the browser
      // sets multipart/form-data with the correct boundary itself.
      ...(typeof init?.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export interface AdminPorudzbina {
  kod: string;
  status: string;
  cena: number;
  polja: Record<string, string>;
  created_at: string;
  prodavnice: { naziv: string };
  modeli: { naziv: string; proizvodi: { naziv: string } };
}

export async function getRedZaIzradu(status?: string) {
  const qs = status ? `?status=${status}` : "";
  return handle<{ porudzbine: AdminPorudzbina[] }>(await adminFetch(`/admin/red-za-izradu${qs}`));
}

export async function setPorudzbinaStatus(kod: string, status: string, napomena?: string) {
  return handle<{ ok: true }>(
    await adminFetch(`/admin/porudzbine/${kod}/status`, { method: "POST", body: JSON.stringify({ status, napomena }) })
  );
}

export async function getPorudzbinaSvgUrl(kod: string) {
  return handle<{ url: string }>(await adminFetch(`/admin/porudzbine/${kod}/svg`));
}

export interface Obavestenje {
  id: string;
  tip: "u_proizvodnji" | "stiglo_u_prodavnicu";
  created_at: string;
  porudzbine: {
    kod: string;
    telefon_kupca: string | null;
    kanal_obavestavanja: "whatsapp" | "viber" | null;
    polja: Record<string, string>;
    prodavnice: { naziv: string };
  };
}

export async function getObavestenja() {
  return handle<{ obavestenja: Obavestenje[] }>(await adminFetch("/admin/obavestenja"));
}

export async function markObavestenjePoslato(id: string) {
  return handle<{ ok: true }>(await adminFetch(`/admin/obavestenja/${id}/poslato`, { method: "POST" }));
}

export interface AdminProdavnica {
  id: string;
  naziv: string;
  slug: string;
  grad: string;
  adresa: string | null;
  radno_vreme: string | null;
  udeo_prodavnice: number;
  aktivna: boolean;
  broj_radnika: number;
  broj_porudzbina: number;
  created_at: string;
}

export async function getAdminProdavnice() {
  return handle<{ prodavnice: AdminProdavnica[] }>(await adminFetch("/admin/prodavnice"));
}

export async function createAdminProdavnica(input: {
  naziv: string;
  slug: string;
  grad: string;
  adresa?: string;
  radno_vreme?: string;
  udeo_prodavnice?: number;
}) {
  return handle<{ prodavnica: AdminProdavnica }>(
    await adminFetch("/admin/prodavnice", { method: "POST", body: JSON.stringify(input) })
  );
}

export async function updateAdminProdavnica(id: string, patch: Partial<Pick<AdminProdavnica, "naziv" | "grad" | "adresa" | "radno_vreme" | "udeo_prodavnice" | "aktivna">>) {
  return handle<{ prodavnica: AdminProdavnica }>(
    await adminFetch(`/admin/prodavnice/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
  );
}

export interface AdminRadnik {
  id: string;
  ime: string;
  aktivan: boolean;
  last_login_at: string | null;
  created_at: string;
}

export async function getAdminProdavnicaDetail(id: string) {
  return handle<{ prodavnica: AdminProdavnica; radnici: AdminRadnik[] }>(await adminFetch(`/admin/prodavnice/${id}`));
}

export async function createAdminRadnik(prodavnicaId: string, input: { ime: string; pin: string }) {
  return handle<{ radnik: AdminRadnik }>(
    await adminFetch(`/admin/prodavnice/${prodavnicaId}/radnici`, { method: "POST", body: JSON.stringify(input) })
  );
}

export async function updateAdminRadnik(id: string, patch: { aktivan?: boolean; pin?: string }) {
  return handle<{ radnik: AdminRadnik }>(await adminFetch(`/admin/radnici/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}

// ---------- Admin: katalog (proizvodi/modeli) ----------

export interface AdminProizvod {
  id: string;
  naziv: string;
  slug: string;
  opis: string | null;
  osnovna_cena: number;
  slike: string[];
  aktivan: boolean;
  sort_order: number;
  broj_modela: number;
  created_at: string;
}

export interface AdminModel {
  id: string;
  proizvod_id: string;
  naziv: string;
  kod: string;
  cena: number | null;
  sablon_svg_path: string;
  sablon_config: SablonConfig;
  polja: PoljeDef[];
  aktivan: boolean;
  sort_order: number;
  created_at: string;
}

export async function getAdminProizvodi() {
  return handle<{ proizvodi: AdminProizvod[] }>(await adminFetch("/admin/proizvodi"));
}

export async function createAdminProizvod(input: { naziv: string; slug: string; opis?: string; osnovna_cena: number }) {
  return handle<{ proizvod: AdminProizvod }>(await adminFetch("/admin/proizvodi", { method: "POST", body: JSON.stringify(input) }));
}

export async function updateAdminProizvod(
  id: string,
  patch: { naziv?: string; opis?: string | null; osnovna_cena?: number; aktivan?: boolean; sort_order?: number }
) {
  return handle<{ proizvod: AdminProizvod }>(await adminFetch(`/admin/proizvodi/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}

export async function addProductImage(productId: string, file: File) {
  const fd = new FormData();
  fd.append("slika", file);
  return handle<{ proizvod: AdminProizvod }>(await adminFetch(`/admin/proizvodi/${productId}/slike`, { method: "POST", body: fd }));
}

export async function removeProductImage(productId: string, index: number) {
  return handle<{ proizvod: AdminProizvod }>(await adminFetch(`/admin/proizvodi/${productId}/slike/${index}`, { method: "DELETE" }));
}

export async function getAdminProizvodDetail(id: string) {
  return handle<{ proizvod: AdminProizvod; modeli: AdminModel[] }>(await adminFetch(`/admin/proizvodi/${id}`));
}

export async function parseSablon(file: File) {
  const fd = new FormData();
  fd.append("sablon", file);
  return handle<{ config: SablonConfig; fields: { key: string; placeholder: string; default_x: number; default_y: number }[] }>(
    await adminFetch("/admin/sabloni/parse", { method: "POST", body: fd })
  );
}

export async function createAdminModel(proizvodId: string, input: { naziv: string; kod: string; cena?: number; polja: PoljeDef[]; sablon: File }) {
  const fd = new FormData();
  fd.append("naziv", input.naziv);
  fd.append("kod", input.kod);
  if (input.cena !== undefined) fd.append("cena", String(input.cena));
  fd.append("polja", JSON.stringify(input.polja));
  fd.append("sablon", input.sablon);
  return handle<{ model: AdminModel }>(await adminFetch(`/admin/proizvodi/${proizvodId}/modeli`, { method: "POST", body: fd }));
}

export async function updateAdminModel(id: string, patch: { naziv?: string; cena?: number | null; aktivan?: boolean }) {
  return handle<{ model: AdminModel }>(await adminFetch(`/admin/modeli/${id}`, { method: "PATCH", body: JSON.stringify(patch) }));
}

// ---------- Admin: finansije ----------

export interface Finansije {
  period: { od: string; do: string };
  ukupno: { broj_porudzbina: number; prihod: number };
  po_danu: { datum: string; prihod: number; broj: number }[];
  po_prodavnici: {
    prodavnica_id: string;
    naziv: string;
    udeo_prodavnice: number;
    broj_porudzbina: number;
    prihod: number;
    zarada_prodavnice: number;
    zarada_platforme: number;
  }[];
  po_proizvodu: { proizvod_id: string; naziv: string; broj_porudzbina: number; prihod: number }[];
}

export async function getFinansije(od?: string, doDate?: string) {
  const qs = new URLSearchParams();
  if (od) qs.set("od", od);
  if (doDate) qs.set("do", doDate);
  const query = qs.toString();
  return handle<Finansije>(await adminFetch(`/admin/finansije${query ? `?${query}` : ""}`));
}

export async function downloadFinansijeCsv(od?: string, doDate?: string) {
  const qs = new URLSearchParams();
  if (od) qs.set("od", od);
  if (doDate) qs.set("do", doDate);
  const query = qs.toString();
  const res = await adminFetch(`/admin/finansije/izvoz${query ? `?${query}` : ""}`);
  if (!res.ok) throw new Error("Greška pri izvozu");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `obracun-${od ?? "period"}-${doDate ?? "sada"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
