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
                vreme_prijave: getSerbianDate(),
                aktivna_sedmica: 1 // Postavljamo na 1 pri skeniranju
            }]);

        if (insertError) throw insertError;

        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}`);
        res.json({ success: true, message: "Aktivirano!" });

    } catch (err) {
        res.status(500).json({ success: false, message: "Greška: " + err.message });
    }
});

// --- RANG LISTA (TOP 50 - FILTRIRANO PO AKTIVNOJ SEDMICI) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('turnir')
            .select(`
                finalni_skor, 
                tiketi!inner ( email, aktivna_sedmica )
            `)
            .eq('tiketi.aktivna_sedmica', 1) // Gleda kolonu iz tiketi tabele
            .order('finalni_skor', { ascending: false })
            .limit(50);
        
        if (error) throw error;
        res.json(data.map(d => ({ 
            prikaz_imena: d.tiketi?.email ? d.tiketi.email.split('@')[0] + "@" : "Gost@", 
            finalni_skor: d.finalni_skor 
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PRETRAGA PO EMAILU (ISTORIJA I RANG) ---
app.get('/api/pronadji-me', async (req, res) => {
    const inputEmail = req.query.email ? req.query.email.trim().toLowerCase() : null;
    if (!inputEmail) return res.status(400).json({ error: "Email nedostaje" });

    try {
        // 1. Globalni rang za aktivnu sedmicu
        const { data: svi, error: errSvi } = await supabase
            .from('turnir')
            .select(`finalni_skor, tiketi!inner(email, aktivna_sedmica)`)
            .eq('tiketi.aktivna_sedmica', 1)
            .order('finalni_skor', { ascending: false });

        if (errSvi) throw errSvi;

        const najboljiIndex = svi.findIndex(d => d.tiketi?.email.toLowerCase() === inputEmail);
        
        if (najboljiIndex === -1) {
            return res.json({ pronadjen: false, message: "Nema rezultata za ovu sedmicu." });
        }

        // 2. Istorija igara (sve igre tog korisnika)
        const { data: istorija, error: errIst } = await supabase
            .from('turnir')
            .select(`
                finalni_skor, 
                pogodaka, 
                promasaji, 
                vreme_igre, 
                tiketi!inner(email, vreme_prijave)
            `)
            .eq('tiketi.email', inputEmail)
            .order('id', { ascending: false }); // Redosled po ID-u jer nema created_at u turnir

        if (errIst) throw errIst;

        res.json({ 
            pronadjen: true, 
            najbolja_pozicija: najboljiIndex + 1, 
            istorija: istorija.map(i => ({
                ...i,
                created_at: i.tiketi.vreme_prijave // Mapiramo vreme prijave za frontend
            }))
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MQTT LOGIKA (UKLJUČENI PROMAŠAJI I VREME) ---
mqttClient.on('connect', () => {
    console.log("MQTT Online!");
    mqttClient.subscribe('arene/rezultati');
});

mqttClient.on('message', async (topic, message) => {
    if (topic === 'arene/rezultati') {
        try {
            const resData = JSON.parse(message.toString());
            console.log("Rezultat primljen:", resData);

            await supabase.from('turnir').insert([{
                barcode: resData.barcode,
                aparat_id: resData.aparat_id,
                pogodaka: resData.pogodaka || 0,
                promasaji: resData.promasaji || 0,     // Dodato
                vreme_igre: resData.vreme_igre || 0,   // Dodato
                finalni_skor: resData.finalni_skor
            }]);
            console.log("Rezultat upisan u bazu.");
        } catch (e) { console.error("MQTT Error:", e); }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server pokrenut na portu ${PORT}`));
