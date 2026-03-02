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

// FUNKCIJA: Početak ove sedmice (Ponedeljak 00:00)
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

// --- SKENIRANJE ---
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
            vreme_prijave: getSerbianDate()
        }]);

        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- RANG LISTA (RESET RADI AUTOMATSKI) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const ponedeljak = getStartOfCurrentWeek();
        // Uzmi samo barkodove od ponedeljka
        const { data: tiketi } = await supabase.from('tiketi').select('barcode, email').gte('vreme_prijave', ponedeljak);
        
        if (!tiketi || tiketi.length === 0) return res.json([]);

        // Uzmi rezultate za te barkodove
        const { data: rez } = await supabase
            .from('turnir')
            .select('finalni_skor, barcode')
            .in('barcode', tiketi.map(t => t.barcode))
            .order('finalni_skor', { ascending: false })
            .limit(50);
        
        const finalna = (rez || []).map(r => {
            const t = tiketi.find(x => x.barcode === r.barcode);
            return { 
                prikaz_imena: t?.email ? t.email.split('@')[0] + "@" : "Gost@", 
                finalni_skor: r.finalni_skor 
            };
        });
        res.json(finalna);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PRETRAGA (CELA ISTORIJA) ---
app.get('/api/pronadji-me', async (req, res) => {
    const inputEmail = req.query.email ? req.query.email.trim().toLowerCase() : null;
    if (!inputEmail) return res.status(400).json({ error: "Email nedostaje" });

    try {
        // 1. Prvo tražimo sve barkodove za taj email u tabeli tiketi
        const { data: mojiTiketi, error: errT } = await supabase
            .from('tiketi')
            .select('barcode, vreme_prijave')
            .eq('email', inputEmail);

        if (errT || !mojiTiketi || mojiTiketi.length === 0) return res.json({ pronadjen: false });

        const mojiBarcodovi = mojiTiketi.map(t => t.barcode);

        // 2. Tražimo rezultate u turnir tabeli za te barkodove
        const { data: istorija } = await supabase
            .from('turnir')
            .select('finalni_skor, pogodaka, promasaji, vreme_igre, barcode')
            .in('barcode', mojiBarcodovi)
            .order('id', { ascending: false });

        // 3. Rangiranje samo za ovu sedmicu
        const ponedeljak = getStartOfCurrentWeek();
        const { data: ovonedeljniTiketi } = await supabase.from('tiketi').select('barcode').gte('vreme_prijave', ponedeljak);
        let mojRang = "N/A";
        
        if (ovonedeljniTiketi && ovonedeljniTiketi.length > 0) {
            const { data: top } = await supabase.from('turnir').select('barcode, finalni_skor').in('barcode', ovonedeljniTiketi.map(x=>x.barcode)).order('finalni_skor', { ascending: false });
            if (top) {
                const idx = top.findIndex(r => mojiBarcodovi.includes(r.barcode));
                if (idx !== -1) mojRang = idx + 1;
            }
        }

        // 4. Pakovanje sa formatiranim datumom
        const finalnaIstorija = (istorija || []).map(ist => {
            const t = mojiTiketi.find(x => x.barcode === ist.barcode);
            const d = new Date(t.vreme_prijave);
            return {
                ...ist,
                datum_prikaz: d.toLocaleDateString('sr-RS') + " " + d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })
            };
        });

        res.json({
            pronadjen: true,
            najbolja_pozicija: mojRang,
            istorija: finalnaIstorija
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- MQTT PRIJEM ---
mqttClient.on('connect', () => {
    mqttClient.subscribe('arene/rezultati');
    console.log("MQTT Online!");
});

mqttClient.on('message', async (topic, message) => {
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
        console.log("Rezultat snimljen.");
    } catch (e) { console.error("Greška pri upisu:", e); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server pokrenut na portu ${PORT}`));
