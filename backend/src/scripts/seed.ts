import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSablonTemplate, type PoljeDef } from "@maestrovolta/sablon-core";
import { supabaseAdmin } from "../lib/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(
  __dirname, "..", "..", "..",
  "personalizovani-proizvodi", "sabloni", "tabla-hrast_sablon.svg"
);

async function ensureBucket(name: string) {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (buckets?.some((b) => b.name === name)) return;
  const { error } = await supabaseAdmin.storage.createBucket(name, { public: false });
  if (error) throw new Error(`Ne mogu da napravim bucket "${name}": ${error.message}`);
  console.log(`✓ bucket "${name}" kreiran`);
}

async function main() {
  console.log("Pravim storage bucket-e...");
  await ensureBucket("sabloni");
  await ensureBucket("slike");
  await ensureBucket("proizvodnja");

  console.log("Pravim pilot prodavnicu...");
  const { data: prodavnica, error: prodavnicaError } = await supabaseAdmin
    .from("prodavnice")
    .upsert(
      {
        naziv: "Gvožđara Pilot",
        slug: "pilot",
        grad: "Beograd",
        adresa: "Pilot adresa 1",
        radno_vreme: "08–20h radnim danima, 08–15h subotom",
      },
      { onConflict: "slug" }
    )
    .select()
    .single();
  if (prodavnicaError) throw new Error(prodavnicaError.message);
  console.log(`✓ prodavnica "${prodavnica.naziv}" (${prodavnica.slug})`);

  console.log("Učitavam i parsiram šablon hrastove table...");
  const svgText = readFileSync(TEMPLATE_PATH, "utf8");
  const parsed = parseSablonTemplate(svgText);
  const sablonHash = createHash("sha256").update(svgText).digest("hex");

  const sablonSvgPath = "tabla-hrast_sablon.svg";
  const { error: uploadError } = await supabaseAdmin.storage
    .from("sabloni")
    .upload(sablonSvgPath, new Blob([svgText], { type: "image/svg+xml" }), { upsert: true, contentType: "image/svg+xml" });
  if (uploadError) throw new Error(`Ne mogu da otpremim šablon: ${uploadError.message}`);
  console.log(`✓ šablon otpremljen u sabloni/${sablonSvgPath}`);

  console.log("Pravim proizvod...");
  const { data: proizvod, error: proizvodError } = await supabaseAdmin
    .from("proizvodi")
    .upsert(
      { naziv: "Tabla s prezimenom", slug: "tabla-prezime", opis: "Lična tabla za kuću ili vikendicu.", osnovna_cena: 2990, sort_order: 1 },
      { onConflict: "slug" }
    )
    .select()
    .single();
  if (proizvodError) throw new Error(proizvodError.message);
  console.log(`✓ proizvod "${proizvod.naziv}"`);

  // Per-field limits/defaults are human judgment, not derivable from the SVG
  // alone (see shared/sablon-core parseSablonTemplate) — matched here to the
  // already-validated values from proba-sablona.html.
  const fieldOverrides: Record<string, Pick<PoljeDef, "label" | "max_len" | "min_mm" | "max_mm" | "default_mm" | "required" | "multiline">> = {
    broj: { label: "Broj", max_len: 6, min_mm: 5, max_mm: 40, default_mm: 26, required: true },
    prezime: { label: "Prezime ili natpis", max_len: 28, min_mm: 5, max_mm: 30, default_mm: 16, required: true },
    posveta: { label: "Posveta", max_len: 160, min_mm: 4, max_mm: 14, default_mm: 8, required: false, multiline: true },
  };

  const polja: PoljeDef[] = parsed.fields.map((f) => {
    const override = fieldOverrides[f.key];
    if (!override) throw new Error(`Nema definisanih granica za polje "${f.key}" u seed skripti`);
    return { key: f.key, placeholder: f.placeholder, default_x: f.default_x, default_y: f.default_y, ...override };
  });

  console.log("Pravim model A (hrast)...");
  const { data: model, error: modelError } = await supabaseAdmin
    .from("modeli")
    .upsert(
      {
        proizvod_id: proizvod.id,
        naziv: "Hrast",
        kod: "A",
        sablon_svg_path: sablonSvgPath,
        sablon_hash: sablonHash,
        sablon_config: parsed.config,
        polja,
      },
      { onConflict: "proizvod_id,kod" }
    )
    .select()
    .single();
  if (modelError) throw new Error(modelError.message);
  console.log(`✓ model "${model.naziv}" (${model.kod})`);

  console.log("\nGotovo. Probaj: GET /prodavnice/pilot/proizvodi");
}

main().catch((err) => {
  console.error("Seed nije uspeo:", err);
  process.exit(1);
});
