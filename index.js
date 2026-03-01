const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

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

// --- RUTA ZA RUČNI UNOS (VAŠ NOVI HTML KORISTI OVU RUTU) ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';
    
    console.log(`--- NOVI POKUŠAJ UPISA ---`);
    console.log(`Podaci: Email: ${email}, PFR: ${tiketId}, Aparat: ${aId}`);

    try {
        // 1. Provera duplikata (da li je ovaj tačan broj već u bazi)
        const { data: postojeci, error: proveraError } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', tiketId)
            .maybeSingle();

        if (proveraError) {
            console.error("Greška pri proveri duplikata:", proveraError);
        }

        if (postojeci) {
            console.log("Status: Duplikat pronađen.");
            return res.status(400).json({ success: false, message: "Ovaj račun je već iskorišćen!" });
        }

        // 2. Upis u bazu
        const upisPodaci = { 
            email: email, 
            barcode: tiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate()
        };

        const { error: insertError } = await supabase
            .from('tiketi')
            .insert([upisPodaci]);

        if (insertError) {
            console.error("SUPABASE GREŠKA:", insertError.message);
            return res.status(500).json({ success: false, message: "Baza nije prihvatila upis: " + insertError.message });
        }

        console.log("Status: Uspešno upisano u Supabase.");

        // 3. Slanje MQTT komande
        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}`);
        console.log(`Status: MQTT komanda poslata na arene/${aId}/komanda`);

        res.json({ success: true, message: "Aktivirano!" });

    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        res.status(500).json({ success: false, message: "Serverska greška." });
    }
});

// --- RANG LISTA ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('turnir')
            .select(`finalni_skor, tiketi ( email )`)
            .order('finalni_skor', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        res.json(data.map(d => ({ 
            prikaz_imena: d.tiketi?.email ? d.tiketi.email.split('@')[0] + "@" : "Gost@", 
            finalni_skor: d.finalni_skor 
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

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
            console.log("Rezultat upisan u turnir tabelu.");
        } catch (e) { console.error("MQTT Message Error:", e); }
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server pokrenut na portu ${PORT}`));
