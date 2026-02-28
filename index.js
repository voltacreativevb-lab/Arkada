const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. POVEZIVANJE NA SUPABASE (Tvoji ključevi)
const supabase = createClient('https://wdnndorxgdzhlytqkyvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkbm5kb3J4Z2R6aGx5dHFreXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNzIzMDQsImV4cCI6MjA4Nzc0ODMwNH0.O5PxSn58e0m8uy9zXSraGs9FfxCzUgVcxKF-8SqNgbU');

// 2. POVEZIVANJE NA MQTT (HIVEMQ)
const mqttClient = mqtt.connect('mqtts://8444eb8746d2443a864e05dee69c84bc.s1.eu.hivemq.cloud', {
    port: 8883,
    username: 'Volta',
    password: 'Arkadavolta2026',
    rejectUnauthorized: false
});

// POSLUŽIVANJE HTML STRANICE (Za skeniranje QR koda)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Ruta za prikaz rang liste
app.get('/leaderboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'leaderboard.html'));
});

// POMOĆNA FUNKCIJA: Izračunavanje trenutne sedmice u godini (1-52)
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

// 3. RUTA ZA SKENIRANJE TIKETA (Poziva je index.html)
app.post('/skeniraj', async (req, res) => {
    const { email, tiketId, aparatId } = req.body;
    const aId = aparatId || 'APARAT_1'; // Sigurnosni default
    
    console.log(`Pokušaj prijave: Email: ${email}, Tiket: ${tiketId}, Aparat: ${aId}`);

    try {
        // Provjera da li je ovaj tiket već iskorišten
        const { data: postojeciTiket } = await supabase
            .from('tiketi')
            .select('*')
            .eq('barcode', tiketId)
            .single();

        if (postojeciTiket) {
            return res.status(400).json({ success: false, message: "Ovaj tiket je već iskorišćen!" });
        }

        // Upis tiketa u bazu (tabela 'tiketi')
        const { error: insertError } = await supabase
            .from('tiketi')
            .insert([{ 
                email: email, 
                barcode: tiketId, 
                arena_id: aId,
                vreme_prijave: new Date() 
            }]);

        if (insertError) throw insertError;

        // Slanje komande baš tom ESP32 uređaju
        mqttClient.publish(`arene/${aId}/komanda`, `START:${tiketId}`);

        res.json({ success: true, message: "Tiket aktiviran! Igra počinje na aparatu." });

    } catch (err) {
        console.error("Greška na serveru:", err);
        res.status(500).json({ success: false, message: "Greška baze podataka." });
    }
});

// 4. PRIJEM REZULTATA SA ESP32 I UPIS U TABELU 'TURNIR'
mqttClient.on('connect', () => {
    console.log("Povezan na HiveMQ Cloud!");
    mqttClient.subscribe('arene/rezultati');
});

mqttClient.on('message', async (topic, message) => {
    if (topic === 'arene/rezultati') {
        try {
            const resultData = JSON.parse(message.toString());
            console.log("Stigao rezultat sa aparata:", resultData.aparat_id);

            // Automatski dodajemo podatak o trenutnoj sedmici
            const trenutnaSedmica = getWeekNumber(new Date());

            // Priprema podataka za Supabase (precizno mapiranje kolona)
            const zaUpis = {
                barcode: resultData.barcode,
                aparat_id: resultData.aparat_id,
                pogodaka: resultData.pogodaka,
                promasaja: resultData.promasaja,
                vreme_igre: resultData.vremeigre,
                finalni_skor: resultData.finalni_skor,
                aktivna_sedmica: trenutnaSedmica
            };

            const { error } = await supabase
                .from('turnir')
                .insert([zaUpis]);

            if (error) {
                console.error("Greška pri upisu rezultata:", error.message);
            } else {
                console.log(`Rezultat sačuvan! Tiket: ${zaUpis.barcode}, Skor: ${zaUpis.finalni_skor}, Sedmica: ${trenutnaSedmica}`);
            }

        } catch (e) {
            console.error("Greška pri obradi JSON poruke sa ESP32:", e);
        }
    }
});

// SERVER POKRETANJE
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
