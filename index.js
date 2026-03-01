const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // Mnogo brže i lakše za Render

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

// Pomoćna funkcija za vreme
function getSerbianDate() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toISOString();
}

// --- RUTA ZA FISKALNE RAČUNE (QR KOD) ---
app.post('/procesuiraj-racun', async (req, res) => {
    const { url, email, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';

    if (!url || !url.includes('suf.purs.gov.rs')) {
        return res.status(400).json({ success: false, message: "Nevalidan link Poreske." });
    }

    try {
        // EKSTREMNO BRZO: Dobijamo JSON direktno od Poreske bez browsera
        const apiURL = url.replace('https://suf.purs.gov.rs/', 'https://suf.purs.gov.rs/api/v1/check');
        const response = await axios.get(apiURL, { timeout: 5000 });
        
        const pfrBroj = response.data.pfr || response.data.invoiceNumber;

        if (!pfrBroj) {
            return res.status(400).json({ success: false, message: "Poreska nije prepoznala račun." });
        }

        // Provera duplikata
        const { data: postojeci } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', pfrBroj)
            .maybeSingle();

        if (postojeci) {
            return res.status(400).json({ success: false, message: "Ovaj račun je već iskorišćen!" });
        }

        // Upis u bazu
        await supabase.from('tiketi').insert([{ 
            email, 
            barcode: pfrBroj, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            napomena: 'QR Sken'
        }]);

        mqttClient.publish(`arene/${aId}/komanda`, `START:${pfrBroj}`);
        res.json({ success: true, pfr: pfrBroj });

    } catch (err) {
        console.error("Greška Axios:", err.message);
        res.status(500).json({ success: false, message: "Poreska uprava trenutno ne odgovara." });
    }
});

// --- RUTA ZA RUČNI UNOS ILI OBIČNE TIKETE ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';
    
    try {
        // Pretraga: Da li se bilo koji PFR u bazi završava na unete cifre?
        // Ovo sprečava da neko ponovo unese zadnja 4 broja već iskorišćenog računa
        const { data: postojeci } = await supabase
            .from('tiketi')
            .select('*')
            .ilike('barcode', `%${tiketId}`)
            .maybeSingle();

        if (postojeci) {
            return res.status(400).json({ success: false, message: "Već iskorišćeno!" });
        }

        await supabase.from('tiketi').insert([{ 
            email, 
            barcode: tiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            napomena: 'Ručni unos'
        }]);

        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}`);
        res.json({ success: true, message: "Aktivirano!" });

    } catch (err) {
        res.status(500).json({ success: false, message: "Greška baze." });
    }
});

// --- RANG LISTA I MQTT REZULTATI (Nepromenjeno, ali stabilno) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const { aparat } = req.query;
        const { data, error } = await supabase
            .from('turnir')
            .select(`finalni_skor, tiketi ( email )`)
            .order('finalni_skor', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        res.json(data.map(d => ({ 
            prikaz_imena: d.tiketi?.email.split('@')[0] + "@", 
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
                aktivna_sedmica: 1 // Možeš dodati funkciju za sedmice
            }]);
        } catch (e) { console.error("MQTT Error:", e); }
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server na ${PORT}`));
