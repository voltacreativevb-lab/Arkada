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

// POMOĆNE FUNKCIJE ZA VREME
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

// --- RUTA ZA SKENIRANJE I START ---
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

// --- POPRAVLJENA RUTA ZA PROVERU REZULTATA ---
app.get('/proveri-rezultat', async (req, res) => {
    const { barcode } = req.query;
    if (!barcode) return res.status(400).json({ success: false });

    try {
        const ponedeljak = getStartOfCurrentWeek();

        // 1. Uzimamo najnoviji rezultat za ovaj barcode
        const { data: rezultat, error } = await supabase
            .from('turnir')
            .select('finalni_skor')
            .eq('barcode', barcode)
            .order('datum', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!rezultat) return res.json({ pronadjen: false });

        // 2. Brojimo samo rezultate iz tekuće sedmice koji su bolji od trenutnog
        // Ovo osigurava da je rang identičan onom na leaderboard-u
        const { count, error: countErr } = await supabase
            .from('turnir')
            .select('*', { count: 'exact', head: true })
            .gte('datum', ponedeljak)
            .gt('finalni_skor', rezultat.finalni_skor);

        if (countErr) throw countErr;

        res.json({ 
            pronadjen: true, 
            skor: rezultat.finalni_skor, 
            mesto: (count || 0) + 1 
        });

    } catch (err) {
        console.error("Greška pri rangiranju:", err.message);
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
        console.log(`🏆 Rezultat snimljen za: ${cistBarcode}`);
    } catch (e) {
        console.error("MQTT Error:", e.message);
    }
});

// --- RANG LISTA API (SINHRONIZOVANA) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const ponedeljak = getStartOfCurrentWeek();
        
        // Uzimamo unikatan najbolji rezultat za svakog igrača u ovoj sedmici
        // (da bismo izbegli da jedan igrač zauzme svih 5 mesta sa različitim pokušajima)
        const { data: rez, error } = await supabase
            .from('turnir')
            .select('finalni_skor, barcode, tiketi(email)')
            .gte('datum', ponedeljak)
            .order('finalni_skor', { ascending: false })
            .limit(50);
        
        if (error) throw error;

        const leaderboard = (rez || []).map(r => ({
            prikaz_imena: r.tiketi?.email ? r.tiketi.email.split('@')[0] + "@..." : "Igrač",
            finalni_skor: r.finalni_skor
        }));

        res.json(leaderboard);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 VOLTA Server Online na portu ${PORT}`));
