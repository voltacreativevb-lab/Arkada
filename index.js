const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. POVEZIVANJE NA SUPABASE
const supabase = createClient('https://wdnndorxgdzhlytqkyvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkbm5kb3J4Z2R6aGx5dHFreXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNzIzMDQsImV4cCI6MjA4Nzc0ODMwNH0.O5PxSn58e0m8uy9zXSraGs9FfxCzUgVcxKF-8SqNgbU');

// 2. POVEZIVANJE NA MQTT
const mqttClient = mqtt.connect('mqtts://8444eb8746d2443a864e05dee69c84bc.s1.eu.hivemq.cloud', {
    port: 8883,
    username: 'Volta',
    password: 'Arkadavolta2026',
    rejectUnauthorized: false
});

// POSLUŽIVANJE STRANICA
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

// POMOĆNA FUNKCIJA ZA SEDMICU
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// --- NOVA RUTA KOJA JE FALILA (API ZA LEADERBOARD) ---
app.get('/api/rang-lista', async (req, res) => {
    try {
        const { aparat } = req.query;
        const trenutnaSedmica = getWeekNumber(new Date());

        console.log(`Zahtev za rang listu. Sedmica: ${trenutnaSedmica}, Aparat: ${aparat}`);

        let query = supabase
            .from('turnir')
            .select('*')
            .eq('aktivna_sedmica', trenutnaSedmica)
            .order('finalni_skor', { ascending: false })
            .limit(10);

        // Ako u URL-u piše npr ?aparat=APARAT_1, filtriraj samo to
        if (aparat && aparat !== 'Global Network' && aparat !== 'Globalno') {
            query = query.eq('aparat_id', aparat);
        }

        const { data, error } = await query;

        if (error) throw error;
        res.json(data); // Šalje niz rezultata tvom HTML-u

    } catch (err) {
        console.error("API Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. RUTA ZA SKENIRANJE TIKETA
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1';
    
    try {
        const { data: postojeciTiket } = await supabase
            .from('tiketi')
            .select('*')
            .eq('barcode', tiketId)
            .single();

        if (postojeciTiket) {
            return res.status(400).json({ success: false, message: "Ovaj tiket je već iskorišćen!" });
        }

        const { error: insertError } = await supabase
            .from('tiketi')
            .insert([{ 
                email: email, 
                barcode: tiketId, 
                arena_id: aId,
                vreme_prijave: new Date() 
            }]);

        if (insertError) throw insertError;

        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}`);
        res.json({ success: true, message: "Tiket aktiviran!" });

    } catch (err) {
        console.error("Greška na serveru:", err);
        res.status(500).json({ success: false, message: "Greška baze podataka." });
    }
});

// 4. PRIJEM REZULTATA I UPIS
mqttClient.on('connect', () => {
    console.log("Povezan na HiveMQ Cloud!");
    mqttClient.subscribe('arene/rezultati');
});

mqttClient.on('message', async (topic, message) => {
    if (topic === 'arene/rezultati') {
        try {
            const resultData = JSON.parse(message.toString());
            const trenutnaSedmica = getWeekNumber(new Date());

            const zaUpis = {
                barcode: resultData.barcode,
                aparat_id: resultData.aparat_id,
                pogodaka: resultData.pogodaka,
                promasaja: resultData.promasaja,
                vreme_igre: 35, // Možeš i resultData.vremeigre ako ga ESP šalje
                finalni_skor: resultData.finalni_skor,
                aktivna_sedmica: trenutnaSedmica
            };

            const { error } = await supabase.from('turnir').insert([zaUpis]);

            if (error) console.error("Greška pri upisu:", error.message);
            else console.log("Rezultat upisan u bazu!");

        } catch (e) {
            console.error("Greška pri obradi JSON-a:", e);
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
