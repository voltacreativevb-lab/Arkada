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

// POMOĆNE FUNKCIJE
function getSerbianDate() {
    const now = new Date();
    now.setHours(now.getHours() + 1); // Srbija UTC+1
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

// SERVIRANJE STRANICA
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'leaderboard.html')));

// --- GLAVNA RUTU ZA PRIJAVU ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';

    // EKSTREMNO ČIŠĆENJE ulaza sa telefona
    const cistTiketId = tiketId ? String(tiketId).replace(/\s+/g, '') : null;

    try {
        if (!cistTiketId) return res.status(400).json({ success: false, message: "Prazan kod!" });

        // Provera duplikata
        const { data: postojeci } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', cistTiketId)
            .maybeSingle();

        if (postojeci) {
            return res.status(400).json({ success: false, message: "Račun je već iskorišćen!" });
        }

        // Upis u bazu (tabela tiketi)
        await supabase.from('tiketi').insert([{ 
            email: email.trim().toLowerCase(), 
            barcode: cistTiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            aktivna_sedmica: 1
        }]);

        // SINHRONIZACIJA: Aparat čeka 1000ms (1 sekundu) pre nego što krene sa 10, 9, 8...
        // To mu daje vremena da se poravna sa telefonom.
        const startDelay = 1000; 
        mqttClient.publish(`arene/${aId}/komanda`, `START:${cistTiketId}:${startDelay}`);
        
        console.log(`✅ Registrovan tiket: ${cistTiketId}. Aparat startuje za 1s.`);
        res.json({ success: true });

    } catch (err) {
        console.error("Greška servera:", err.message);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});

// --- PRIJEM REZULTATA (SA FIX-OM ZA FOREIGN KEY) ---
mqttClient.on('connect', () => {
    mqttClient.subscribe('arene/rezultati');
    console.log("MQTT Online!");
});

mqttClient.on('message', async (topic, message) => {
    try {
        const resData = JSON.parse(message.toString());
        
        // Čišćenje bar-koda koji stiže sa aparata (često ima nevidljive \r ili \n)
        const cistBarcode = resData.barcode ? String(resData.barcode).replace(/\s+/g, '') : null;

        if (!cistBarcode) return;

        // Provera postojanja u tabeli 'tiketi' pre upisa u 'turnir'
        const { data: tiketPostoji } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', cistBarcode)
            .maybeSingle();

        if (!tiketPostoji) {
            console.error(`❌ Greška: Barcode [${cistBarcode}] ne postoji u tabeli 'tiketi'. Upis rezultata odbijen.`);
            return;
        }

        const podaciZaTurnir = {
            barcode: cistBarcode,
            aparat_id: resData.aparat_id || 'APARAT_1',
            pogodaka: parseInt(resData.pogodaka) || 0,
            promasaja: parseInt(resData.promasaja) || 0, 
            vreme_igre: parseInt(resData.vreme_igre) || 0,
            finalni_skor: parseInt(resData.finalni_skor) || 0,
            datum: getSerbianDate(),
            aktivna_sedmica: 1
        };

        const { error: insertErr } = await supabase.from('turnir').insert([podaciZaTurnir]);
        
        if (insertErr) console.error("Baza odbila upis u turnir:", insertErr.message);
        else console.log(`🏆 Rezultat uspešno upisan za: ${cistBarcode}`);

    } catch (e) {
        console.error("Loš format MQTT poruke:", e.message);
    }
});

// --- RANG LISTA ---
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
        
        res.json((rez || []).map(r => {
            const t = tiketi.find(x => x.barcode === r.barcode);
            return { 
                prikaz_imena: t?.email ? t.email.split('@')[0] + "@..." : "Igrač", 
                finalni_skor: r.finalni_skor 
            };
        }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VOLTA Arena Server pokrenut.`));
