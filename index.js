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

// POMOĆNE FUNKCIJE ZA DATUM
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

// SERVIRANJE STATIČKIH FAJLOVA
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'leaderboard.html')));

// --- GLAVNA RUTU ZA PRIJAVU I SINHRONIZOVAN START ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';

    try {
        // 1. Provera da li je tiket već iskorišćen
        const { data: postojeci } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', tiketId)
            .maybeSingle();

        if (postojeci) {
            return res.status(400).json({ success: false, message: "Ovaj račun je već iskorišćen!" });
        }

        // 2. Upis novog tiketa u bazu
        await supabase.from('tiketi').insert([{ 
            email: email.trim().toLowerCase(), 
            barcode: tiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            aktivna_sedmica: 1
        }]);

        // 3. SINHRONIZACIJA
        // Aparat dobija delay od 1000ms da bi sačekao telefon da se učita.
        // Obojica će onda paralelno brojati od 10 do 0.
        const delayZaAparat = 1000; 
        
        // MQTT poruka format: START:barcode:delay
        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}:${delayZaAparat}`);
        
        console.log(`Poslata komanda za ${aId}: START:${tiketId}:${delayZaAparat}`);
        res.json({ success: true });

    } catch (err) {
        console.error("Greška u /skeniraj:", err.message);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});

// --- MQTT PRIJEM REZULTATA SA APARATA ---
mqttClient.on('connect', () => {
    mqttClient.subscribe('arene/rezultati');
    console.log("MQTT Online i povezan na HiveMQ!");
});

mqttClient.on('message', async (topic, message) => {
    try {
        const resData = JSON.parse(message.toString());
        console.log("Stigao rezultat sa aparata:", resData);

        const podaciZaBazu = {
            barcode: resData.barcode,
            aparat_id: resData.aparat_id,
            pogodaka: resData.pogodaka ?? 0,
            promasaja: resData.promasaja ?? 0, 
            vreme_igre: resData.vreme_igre ?? 0,
            finalni_skor: resData.finalni_skor ?? 0,
            datum: getSerbianDate(),
            aktivna_sedmica: 1
        };

        const { error } = await supabase.from('turnir').insert([podaciZaBazu]);
        if (error) console.error("Greška pri upisu rezultata:", error.message);
        else console.log("Rezultat uspešno upisan u tabelu turnir!");

    } catch (e) {
        console.error("Greška u obradi MQTT poruke:", e);
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
        
        const formatirano = (rez || []).map(r => {
            const t = tiketi.find(x => x.barcode === r.barcode);
            return { 
                prikaz_imena: t?.email ? t.email.split('@')[0] + "@..." : "Gost", 
                finalni_skor: r.finalni_skor 
            };
        });

        res.json(formatirano);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POKRETANJE SERVERA
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VOLTA Server pokrenut na portu ${PORT}`));
