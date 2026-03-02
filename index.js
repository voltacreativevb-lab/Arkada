const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. POVEZIVANJE NA SUPABASE
const supabase = createClient(
    'https://wdnndorxgdzhlytqkyvh.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkbm5kb3J4Z2R6aGx5dHFreXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNzIzMDQsImV4cCI6MjA4Nzc0ODMwNH0.O5PxSn58e0m8uy9zXSraGs9FfxCzUgVcxKF-8SqNgbU'
);

// 2. POVEZIVANJE NA MQTT
const mqttClient = mqtt.connect('mqtts://8444eb8746d2443a864e05dee69c84bc.s1.eu.hivemq.cloud', {
    port: 8883,
    username: 'Volta',
    password: 'Arkadavolta2026',
    rejectUnauthorized: false
});

// FUNKCIJA: Početak tekuće sedmice (Ponedeljak 00:00:00)
function getStartOfCurrentWeek() {
    const d = new Date();
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
}

// FUNKCIJA: Trenutno vreme u Srbiji (UTC+1)
function getSerbianDate() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString();
}

// --- POSLUŽIVANJE HTML FAJLOVA ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'leaderboard.html')));

// --- 3. RUTA ZA AKTIVACIJU APARATA (SKENIRANJE) ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';
    
    try {
        const { data: postojeci } = await supabase.from('tiketi').select('barcode').eq('barcode', tiketId).maybeSingle();
        if (postojeci) return res.status(400).json({ success: false, message: "Ovaj račun je već iskorišćen!" });

        const { error: insertError } = await supabase.from('tiketi').insert([{ 
            email: email.trim().toLowerCase(), 
            barcode: tiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            aktivna_sedmica: 1
        }]);

        if (insertError) throw insertError;

        // Sinhronizacija: Šaljemo server timestamp aparatu
        const serverTimestamp = Date.now();
        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}:${serverTimestamp}`);
        
        res.json({ success: true, message: "Aktivirano!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Greška: " + err.message });
    }
});

// --- 4. RANG LISTA (TOP 50 - AUTOMATSKI RESET) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const ponedeljak = getStartOfCurrentWeek();

        // Korak 1: Nađi tikete od ovog ponedeljka
        const { data: noviTiketi, error: errT } = await supabase
            .from('tiketi')
            .select('barcode, email')
            .gte('vreme_prijave', ponedeljak);

        if (errT) throw errT;
        if (!noviTiketi || noviTiketi.length === 0) return res.json([]);

        const barcodovi = noviTiketi.map(t => t.barcode);

        // Korak 2: Uzmi rezultate samo za te barcodove
        const { data: rezultati, error: errR } = await supabase
            .from('turnir')
            .select('finalni_skor, barcode')
            .in('barcode', barcodovi)
            .order('finalni_skor', { ascending: false })
            .limit(50);

        if (errR) throw errR;

        // Korak 3: Spoji emailove sa rezultatima
        const prikaz = rezultati.map(r => {
            const t = noviTiketi.find(tik => tik.barcode === r.barcode);
            return {
                prikaz_imena: t?.email ? t.email.split('@')[0] + "@" : "Gost@",
                finalni_skor: r.finalni_skor
            };
        });

        res.json(prikaz);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 5. DETALJNA PRETRAGA (CELA ISTORIJA + DATUM) ---
app.get('/api/pronadji-me', async (req, res) => {
    const inputEmail = req.query.email ? req.query.email.trim().toLowerCase() : null;
    if (!inputEmail) return res.status(400).json({ error: "Email nedostaje" });

    try {
        // Korak 1: Svi tiketi ikada za taj email
        const { data: sviMojiTiketi, error: errT } = await supabase
            .from('tiketi')
            .select('barcode, vreme_prijave')
            .eq('email', inputEmail);

        if (errT || !sviMojiTiketi || sviMojiTiketi.length === 0) {
            return res.json({ pronadjen: false, message: "Nema podataka za ovaj email." });
        }

        const mojiBarcodovi = sviMojiTiketi.map(t => t.barcode);

        // Korak 2: Svi rezultati iz turnira
        const { data: istorija, error: errI } = await supabase
            .from('turnir')
            .select('finalni_skor, pogodaka, promasaji, vreme_igre, barcode')
            .in('barcode', mojiBarcodovi)
            .order('id', { ascending: false });

        if (errI) throw errI;

        // Korak 3: Izračunaj rang samo za OVU nedelju
        const ponedeljak = getStartOfCurrentWeek();
        const { data: ovonedeljniTiketi } = await supabase.from('tiketi').select('barcode, email').gte('vreme_prijave', ponedeljak);
        
        let mojRang = "N/A";
        if (ovonedeljniTiketi && ovonedeljniTiketi.length > 0) {
            const vazi = ovonedeljniTiketi.map(t => t.barcode);
            const { data: top } = await supabase.from('turnir').select('barcode, finalni_skor').in('barcode', vazi).order('finalni_skor', { ascending: false });
            
            if (top) {
                const idx = top.findIndex(r => {
                    const t = ovonedeljniTiketi.find(tik => tik.barcode === r.barcode);
                    return t?.email.toLowerCase() === inputEmail;
                });
                if (idx !== -1) mojRang = idx + 1;
            }
        }

        // Korak 4: Formatiranje za prikaz
        const finalnaIstorija = istorija.map(ist => {
            const tiket = sviMojiTiketi.find(t => t.barcode === ist.barcode);
            const d = new Date(tiket.vreme_prijave);
            const lepDatum = d.toLocaleDateString('sr-RS') + " " + d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });

            return {
                finalni_skor: ist.finalni_skor,
                pogodaka: ist.pogodaka,
                promasaji: ist.promasaji,
                vreme_igre: ist.vreme_igre,
                datum_prikaz: lepDatum
            };
        });

        res.json({
            pronadjen: true,
            najbolja_pozicija: mojRang,
            istorija: finalnaIstorija 
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 6. MQTT LOGIKA (PRIJEM REZULTATA) ---
mqttClient.on('connect', () => {
    console.log("MQTT Online!");
    mqttClient.subscribe('arene/rezultati');
});

mqttClient.on('message', async (topic, message) => {
    if (topic === 'arene/rezultati') {
        try {
            const resData = JSON.parse(message.toString());
            console.log("Stigao rezultat za:", resData.barcode);

            await supabase.from('turnir').insert([{
                barcode: resData.barcode,
                aparat_id: resData.aparat_id,
                pogodaka: resData.pogodaka || 0,
                promasaji: resData.promasaji || 0,
                vreme_igre: resData.vreme_igre || 0,
                finalni_skor: resData.finalni_skor
            }]);
            console.log("Uspešno upisano.");
        } catch (e) {
            console.error("MQTT Error:", e.message);
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VOLTA Server pokrenut na portu ${PORT}`));
