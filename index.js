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
    now.setHours(now.getHours() + 1); 
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

// --- RUTA ZA SKENIRANJE I START IGRE ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';
    const cistTiketId = tiketId ? String(tiketId).replace(/\s+/g, '') : null;

    try {
        if (!cistTiketId) return res.status(400).json({ success: false, message: "Prazan kod!" });

        const { data: postojeci } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', cistTiketId)
            .maybeSingle();

        if (postojeci) return res.status(400).json({ success: false, message: "Račun je već iskorišćen!" });

        await supabase.from('tiketi').insert([{ 
            email: email.trim().toLowerCase(), 
            barcode: cistTiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            aktivna_sedmica: 1
        }]);

        mqttClient.publish(`arene/${aId}/komanda`, `START:${cistTiketId}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- NOVA RUTA: PROVJERA REZULTATA I RANGIRANJE ---
// Ovu rutu telefon poziva dok piše "SABIRAMO..."
app.get('/proveri-rezultat', async (req, res) => {
    const { barcode } = req.query;
    if (!barcode) return res.status(400).json({ success: false });

    try {
        // 1. Tražimo rezultat u tabeli turnir
        const { data: rezultat, error } = await supabase
            .from('turnir')
            .select('finalni_skor')
            .eq('barcode', barcode)
            .maybeSingle();

        if (error) throw error;

        // Ako rezultat još nije stigao
        if (!rezultat) {
            return res.json({ pronadjen: false });
        }

        // 2. Ako je rezultat stigao, računamo mjesto na rang listi
        // Gledamo koliko igrača ima VIŠE bodova od trenutnog
        const { count, error: countErr } = await supabase
            .from('turnir')
            .select('*', { count: 'exact', head: true })
            .gt('finalni_skor', rezultat.finalni_skor);

        if (countErr) throw countErr;

        // Mesto = broj ljudi iznad + 1
        res.json({ 
            pronadjen: true, 
            skor: rezultat.finalni_skor, 
            mesto: (count || 0) + 1 
        });

    } catch (err) {
        console.error("Greška pri proveri rezultata:", err.message);
        res.status(500).json({ error: "Greška na serveru" });
    }
});

// --- MQTT PRIJEM REZULTATA ---
mqttClient.on('connect', () => {
    mqttClient.subscribe('arene/rezultati');
    console.log("📡 MQTT Online!");
});

mqttClient.on('message', async (topic, message) => {
    try {
        const resData = JSON.parse(message.toString());
        const cistBarcode = resData.barcode ? String(resData.barcode).replace(/\s+/g, '') : null;

        if (!cistBarcode) return;

        const { data: provera } = await supabase.from('tiketi').select('barcode').eq('barcode', cistBarcode).maybeSingle();
        if (!provera) return;

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

        await supabase.from('turnir').insert([podaciZaUpis]);
        console.log(`🏆 Rezultat snimljen: ${cistBarcode}`);
    } catch (e) {
        console.error("MQTT Error:", e.message);
    }
});

// --- RANG LISTA API ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const ponedeljak = getStartOfCurrentWeek();
        const { data: tiketi } = await supabase.from('tiketi').select('barcode, email').gte('vreme_prijave', ponedeljak);
        if (!tiketi || tiketi.length === 0) return res.json([]);

        const { data: rez } = await supabase
            .from('turnir')
            .select('finalni_skor, barcode')
            .in('barcode', tiketi.map(t => t.barcode))
            .order('finalni_skor', { ascending: false })
            .limit(50);
        
        res.json((rez || []).map(r => {
            const t = tiketi.find(x => x.barcode === r.barcode);
            return { prikaz_imena: t?.email ? t.email.split('@')[0] + "@..." : "Igrač", finalni_skor: r.finalni_skor };
        }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 VOLTA Server Online na portu ${PORT}`));
