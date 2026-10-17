# Personalizovani proizvodi za kuću preko gvožđara

Pregled projekta i odluka iz razgovora, kao polazna tačka za programera.

## Ideja
- Stand sa 5 uzoraka i slikama ostalih proizvoda u gvožđarama (start: 36 prodavnica).
- Kupac skenira QR kod prodavnice → sajt zna iz koje je prodavnice → bira proizvod, model (2–3 po proizvodu) i upisuje tekst (broj, prezime, posveta).
- Plaća na kasi prodavnice → radnik potvrđuje uplatu → porudžbina ide u proizvodnju → isporuka u prodavnicu → kupac preuzima.
- Prodavnica zadržava 40% maloprodajne cene. Sva roba je personalizovana i ne vraća se.

## Uloge
- **Proizvođač / admin** (jedan nalog, dvostepena prijava): proizvodnja, poruke kupcima, isporuke, katalog, prodavnice, obračun.
- **Radnik prodavnice** (PIN po radniku): vidi samo svoju prodavnicu. Dugmad: Naplaćeno, Primljeno (paket stigao), Preuzeto.
- **Kupac**: bez naloga.

## Statusi porudžbine
Kreirana (čeka uplatu, ističe za 48 h) → Plaćena → U proizvodnji → Poslata u prodavnicu → Spremna za preuzimanje → Preuzeta. Sporedni: Otkazana, Istekla.

## Poruke kupcima
- Samo Viber ili WhatsApp (kupac bira), sa običnog broja proizvođača. Bez SMS-a i bez poslovnih naloga.
- Slanje je poluautomatsko: lista „Za obavestiti" u panelu proizvodnje, dugme otvara razgovor sa gotovim tekstom (WhatsApp: wa.me link sa tekstom; Viber: kopira tekst i otvara razgovor), zatim „Poslato".
- Dve poruke, obe šalje proizvođač:
  1. Primljeno u proizvodnju (posle „Naplaćeno"), sa očekivanim datumom preuzimanja.
  2. Stiglo u radnju (posle „Primljeno" u prodavnici), sa adresom i radnim vremenom.

## SVG šabloni (iz CorelDRAW-a)
- Izvoz: File → Export → SVG, **Text: As text**, bez ugrađenih fontova, **Encoding: UTF-8**.
- Tekst kao Artistic text (jedan klik alatom za tekst), centriran (Ctrl+E), bez razmaka za poravnanje.
- Oznake: `{BROJ}`, `{PREZIME}`, `{POSVETA}` (iste u svim modelima).
- Boje linija:
  - **Crvena #FF0000**: linija sečenja i rupe, ostaje u fajlu za laser.
  - **Zelena #00FF00**: polje u kome kupac sme da pomera tekst, **izbacuje se iz fajla za laser**.
- Sajt menja oznake tekstom kupca, prikazuje pregled i čuva gotov SVG za proizvodnju. U Corelu: tekst u krivulje (Ctrl+Q) pa na laser.

## Personalizacija na sajtu (vidi proba/proba-sablona.html)
- Izbor fonta (Montserrat, Oswald, PT Serif, Playfair Display, Comfortaa, Lobster, Marck Script, Arial). Fontovi moraju biti instalirani i u Corelu.
- Latinica / ćirilica: kupac kuca latinicom, sajt preslovi (lj, nj, dž → љ, њ, џ).
- Veličina slova po redu (u mm), automatsko smanjenje ako red ne staje.
- Pomeranje teksta prstom/mišem samo unutar zelenog polja, sa automatskim centriranjem.
- Server ponovo proverava cenu, dužinu teksta i položaj pre upisa porudžbine.

## Tehnologija
- **GitHub**: kod, automatsko objavljivanje na Render.
- **Render.com**: sajt za kupce, panel prodavnice, panel proizvodnje/admina, serverski deo (provera porudžbine, pravljenje SVG-a).
- **Supabase**: baza (PostgreSQL), prijava, skladište fajlova, Row Level Security (radnik vidi samo svoju prodavnicu), Realtime (nova porudžbina odmah na tabletu).
  - Tabele: `prodavnice`, `radnici`, `proizvodi`, `modeli`, `porudzbine`, `istorija_statusa`.
  - Skladište: `sabloni/`, `slike/`, `proizvodnja/`.
- Za rad uživo: plaćeni planovi (besplatni se uspavljuju/pauziraju) i automatske rezervne kopije baze.

## Fajlovi u ovom folderu
- `dizajn-ekrana/`: dizajn ekrana (kupac: Main, Konfigurator, Potvrda, Status; Prodavnica; Proizvodnja). Ovo su fajlovi za Claude Design platno i nisu samostalne stranice; služe programeru kao vizuelna referenca.
- `proba/proba-sablona.html`: radna probna stranica sa šablonom hrastove table. Otvara se direktno u pregledaču.
- `sabloni/original-iz-corela.svg`: prvi izvoz iz Corela.
- `sabloni/tabla-hrast_sablon.svg`: očišćen šablon sa zelenim poljem.
- `sabloni/tabla-hrast_K7F-42_proizvodnja.svg`: primer gotovog fajla za laser.

## Otvoreno / sledeći koraci
- Ekrani za kupca još pominju SMS: prepraviti na Viber/WhatsApp i dodati dugme „Prati porudžbinu na WhatsApp / Viber".
- Dizajn admin kartica: Katalog, Prodavnice, Obračun.
- Pilot pre širenja; meriti porudžbine po prodavnici mesečno.
