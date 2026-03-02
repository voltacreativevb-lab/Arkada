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

// Funkcija za dobijanje početka trenutne sedmice (Ponedeljak 00:00)
function getStartOfCurrentWeek() {
    const d = new Date();
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
}

function getSerbianDate() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString();
}

// --- POSLUŽIVANJE HTML FAJLOVA ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'leaderboard.html')));

// --- RUTA ZA AKTIVACIJU APARATA ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';
    
    try {
        const { data: postojeci } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', tiketId)
            .maybeSingle();

        if (postojeci) {
            return res.status(400).json({ success: false, message: "Ovaj račun je već iskorišćen!" });
        }

        const { error: insertError } = await supabase
            .from('tiketi')
            .insert([{ 
                email: email.trim().toLowerCase(), 
                barcode: tiketId, 
                arena_id: aId,
                vreme_prijave: getSerbianDate()
            }]);

        if (insertError) throw insertError;

        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}`);
        res.json({ success: true, message: "Aktivirano!" });

    } catch (err) {
        res.status(500).json({ success: false, message: "Greška: " + err.message });
    }
});

// --- RANG LISTA (TOP 50 - RESET SVAKOG PONEDELJKA) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const startOfWeek = getStartOfCurrentWeek();

        const { data, error } = await supabase
            .from('turnir')
            .select(`finalni_skor, created_at, tiketi ( email )`)
            .gte('created_at', startOfWeek) // Samo rezultati od ovog ponedeljka
            .order('finalni_skor', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        res.json(data.map(d => ({ 
            prikaz_imena: d.tiketi?.email ? d.tiketi.email.split('@')[0] + "@" : "Gost@", 
            finalni_skor: d.finalni_skor 
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PRETRAGA PO EMAILU (SA FIXOM ZA NALAŽENJE) ---
app.get('/api/pronadji-me', async (req, res) => {
    const inputEmail = req.query.email ? req.query.email.trim().toLowerCase() : null;
    if (!inputEmail) return res.status(400).json({ error: "Email nedostaje" });

    try {
        const startOfWeek = getStartOfCurrentWeek();

        // 1. Globalni rang za ovu sedmicu
        const { data: svi, error: errSvi } = await supabase
            .from('turnir')
            .select(`finalni_skor, tiketi!inner(email)`)
            .gte('created_at', startOfWeek)
            .order('finalni_skor', { ascending: false });

        if (errSvi) throw errSvi;

        const najboljiIndex = svi.findIndex(d => d.tiketi?.email.toLowerCase() === inputEmail);
        
        if (najboljiIndex === -1) {
            return res.json({ pronadjen: false, message: "Nema rezultata za ovu sedmicu." });
        }

        // 2. Istorija igara za ovu sedmicu
        const { data: istorija, error: errIst } = await supabase
            .from('turnir')
            .select(`finalni_skor, pogodaka, created_at, tiketi!inner(email)`)
            .eq('tiketi.email', inputEmail)
            .gte('created_at', startOfWeek)
            .order('created_at', { ascending: false });

        if (errIst) throw errIst;

        res.json({ 
            pronadjen: true, 
            najbolja_pozicija: najboljiIndex + 1, 
            istorija: istorija 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MQTT LOGIKA ---
mqttClient.on('connect', () => {
    console.log("MQTT Online!");
    mqttClient.subscribe('arene/rezultati');
});

mqttClient.on('message', async (topic, message) => {
    if (topic === 'arene/rezultati') {
        try {
            const resData = JSON.parse(message.toString());
            await supabase.from('turnir').insert([{
                barcode: resData.barcode,
                aparat_id: resData.aparat_id,
                pogodaka: resData.pogodaka,
                finalni_skor: resData.finalni_skor,
                aktivna_sedmica: 1
            }]);
            console.log("Rezultat upisan.");
        } catch (e) { console.error("MQTT Error:", e); }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server pokrenut na portu ${PORT}`));
