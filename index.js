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

// 2. POVEZIVANJE NA MQTT (HiveMQ Cloud)
const mqttClient = mqtt.connect('mqtts://8444eb8746d2443a864e05dee69c84bc.s1.eu.hivemq.cloud', {
    port: 8883,
    username: 'Volta',
    password: 'Arkadavolta2026',
    rejectUnauthorized: false
});

// POMOĆNE FUNKCIJE ZA DATUM I VREME
function getSerbianDate() {
    const now = new Date();
    now.setHours(now.getHours() + 1); // Ručno podešavanje za Srbiju UTC+1
    return now.toISOString();
}

function getStartOfCurrentWeek() {
    const d = new Date();
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
}

// SERVIRANJE FRONTEND STRANICA
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'leaderboard.html')));

// --- RUTA ZA SKENIRANJE I START IGRE ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';

    // OBAVEZNO ČIŠĆENJE: Brišemo sve razmake iz barcode-a koji dolaze sa telefona
    const cistTiketId = tiketId ? String(tiketId).replace(/\s+/g, '') : null;

    try {
        if (!cistTiketId) return res.status(400).json({ success: false, message: "Prazan kod!" });

        // 1. Provera da li je tiket već iskorišćen
        const { data: postojeci } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', cistTiketId)
            .maybeSingle();

        if (postojeci) {
            return res.status(400).json({ success: false, message: "Račun je već iskorišćen!" });
        }

        // 2. Upis u tabelu 'tiketi'
        const { error: ticketErr } = await supabase.from('tiketi').insert([{ 
            email: email.trim().toLowerCase(), 
            barcode: cistTiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            aktivna_sedmica: 1
        }]);

        if (ticketErr) throw ticketErr;

        // 3. SLANJE ČISTE KOMANDE APARATU (Bez delay parametra)
        // Format poruke: START:44278
        mqttClient.publish(`arene/${aId}/komanda`, `START:${cistTiketId}`);
        
        console.log(`✅ Registrovan tiket: ${cistTiketId}. MQTT komanda poslata.`);
        res.json({ success: true });

    } catch (err) {
        console.error("Greška pri skeniranju:", err.message);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});

// --- PRIJEM REZULTATA SA APARATA (MQTT) ---
mqttClient.on('connect', () => {
    mqttClient.subscribe('arene/rezultati');
    console.log("📡 MQTT Klijent je Online!");
});

mqttClient.on('message', async (topic, message) => {
    try {
        const resData = JSON.parse(message.toString());
        
        // Uzimamo barcode iz JSON-a i čistimo ga od razmaka
        const cistBarcode = resData.barcode ? String(resData.barcode).replace(/\s+/g, '') : null;

        if (!cistBarcode) {
            console.error("Aparat poslao JSON bez barcode-a.");
            return;
        }

        // PROVERA STRANOG KLJUČA: Da li ovaj barcode postoji u 'tiketi'?
        const { data: provera } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', cistBarcode)
            .maybeSingle();

        if (!provera) {
            console.error(`❌ Foreign Key Error: Barcode [${cistBarcode}] ne postoji u tabeli tiketi.`);
            return;
        }

        // UPIS REZULTATA U TABELU 'turnir'
        const podaciZaUpis = {
            barcode: cistBarcode,
            aparat_id: resData.aparat_id || 'APARAT_1',
            pogodaka: parseInt(resData.pogodaka) || 0,
            promasaja: parseInt(resData.promasaja) || 0, 
            vreme_igre: parseInt(resData.vreme_igre) || 0,
            finalni_skor: parseInt(resData.finalni_skor) || 0,
            datum: getSerbianDate(),
            aktivna_sedmica: 1
        };

        const { error: insertErr } = await supabase.from('turnir').insert([podaciZaUpis]);
        
        if (insertErr) {
            console.error("Baza odbila upis rezultata:", insertErr.message);
        } else {
            console.log(`🏆 Rezultat uspešno snimljen za barcode: ${cistBarcode}`);
        }

    } catch (e) {
        console.error("Greška pri obradi MQTT poruke (Loš JSON?):", e.message);
    }
});

// --- RANG LISTA API ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const ponedeljak = getStartOfCurrentWeek();
        const { data: tiketi } = await supabase
            .from('tiketi')
            .select('barcode, email')
            .gte('vreme_prijave', ponedeljak);
        
        if (!tiketi || tiketi.length === 0) return res.json([]);

        const { data: rez } = await supabase
            .from('turnir')
            .select('finalni_skor, barcode')
            .in('barcode', tiketi.map(t => t.barcode))
            .order('finalni_skor', { ascending: false })
            .limit(50);
        
        const leaderboard = (rez || []).map(r => {
            const t = tiketi.find(x => x.barcode === r.barcode);
            return { 
                prikaz_imena: t?.email ? t.email.split('@')[0] + "@..." : "Igrač", 
                finalni_skor: r.finalni_skor 
            };
        });

        res.json(leaderboard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// START SERVERA
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 VOLTA Server radi na portu ${PORT}`);
});
