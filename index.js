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

// Funkcija za precizan početak sedmice (Ponedeljak 00:00)
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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'leaderboard.html')));

// --- RUTA ZA AKTIVACIJU APARATA ---
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';
    
    try {
        const { data: postojeci } = await supabase.from('tiketi').select('barcode').eq('barcode', tiketId).maybeSingle();
        if (postojeci) return res.status(400).json({ success: false, message: "Račun je već iskorišćen!" });

        await supabase.from('tiketi').insert([{ 
            email: email.trim().toLowerCase(), 
            barcode: tiketId, 
            arena_id: aId,
            vreme_prijave: getSerbianDate(),
            aktivna_sedmica: 1
        }]);

        // REŠENJE ZA TAJMER: Šaljemo Timestamp servera aparatu da se sinhronizuju
        const serverTime = Date.now();
        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}:${serverTime}`);
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- RANG LISTA (RESET RADI AUTOMATSKI) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const ponedeljak = getStartOfCurrentWeek();

        // 1. Uzmi barcodove od ponedeljka do danas
        const { data: noviTiketi, error: errT } = await supabase
            .from('tiketi')
            .select('barcode, email')
            .gte('vreme_prijave', ponedeljak);

        if (errT) throw errT;
        if (!noviTiketi || noviTiketi.length === 0) return res.json([]);

        const barcodovi = noviTiketi.map(t => t.barcode);

        // 2. Uzmi rezultate za te barcodove
        const { data: rezultati, error: errR } = await supabase
            .from('turnir')
            .select('finalni_skor, barcode')
            .in('barcode', barcodovi)
            .order('finalni_skor', { ascending: false })
            .limit(50);

        if (errR) throw errR;

        const finalnaLista = rezultati.map(r => {
            const t = noviTiketi.find(tik => tik.barcode === r.barcode);
            return {
                prikaz_imena: t?.email ? t.email.split('@')[0] + "@" : "Gost@",
                finalni_skor: r.finalni_skor
            };
        });

        res.json(finalnaLista);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PRETRAGA (FIXED: RADI UVEK) ---
app.get('/api/pronadji-me', async (req, res) => {
    const inputEmail = req.query.email ? req.query.email.trim().toLowerCase() : null;
    if (!inputEmail) return res.status(400).json({ error: "Email nedostaje" });

    try {
        // 1. Nađi sve tikete korisnika
        const { data: mojiTiketi } = await supabase
            .from('tiketi')
            .select('barcode, vreme_prijave')
            .eq('email', inputEmail);

        if (!mojiTiketi || mojiTiketi.length === 0) return res.json({ pronadjen: false });

        const mojiBarcodovi = mojiTiketi.map(t => t.barcode);

        // 2. Istorija
        const { data: istorija } = await supabase
            .from('turnir')
            .select('finalni_skor, pogodaka, promasaji, vreme_igre, barcode')
            .in('barcode', mojiBarcodovi)
            .order('id', { ascending: false });

        // 3. Rang (za ovu sedmicu)
        const ponedeljak = getStartOfCurrentWeek();
        const { data: ovonedeljni } = await supabase.from('tiketi').select('barcode, email').gte('vreme_prijave', ponedeljak);
        
        let mojRang = "N/A";
        if (ovonedeljni && ovonedeljni.length > 0) {
            const vazeciBarcodovi = ovonedeljni.map(t => t.barcode);
            const { data: top } = await supabase.from('turnir').select('barcode, finalni_skor').in('barcode', vazeciBarcodovi).order('finalni_skor', { ascending: false });
            
            if (top) {
                const index = top.findIndex(r => {
                    const t = ovonedeljni.find(tik => tik.barcode === r.barcode);
                    return t?.email.toLowerCase() === inputEmail;
                });
                if (index !== -1) mojRang = index + 1;
            }
        }

        res.json({
            pronadjen: true,
            najbolja_pozicija: mojRang,
            istorija: (istorija || []).map(ist => ({
                ...ist,
                created_at: mojiTiketi.find(t => t.barcode === ist.barcode)?.vreme_prijave
            }))
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MQTT PRIJEM (SA POPRAVKOM ZA PROMAŠAJE I VREME) ---
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
                pogodaka: resData.pogodaka || 0,
                promasaji: resData.promasaji || 0,
                vreme_igre: resData.vreme_igre || 0,
                finalni_skor: resData.finalni_skor
            }]);
            console.log("Rezultat upisan.");
        } catch (e) { console.error("MQTT JSON Error:", e); }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server pokrenut.`));
