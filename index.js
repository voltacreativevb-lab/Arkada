const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cron = require('node-cron');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 1. POVEZIVANJE NA SUPABASE
const supabase = createClient('https://wdnndorxgdzhlytqkyvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkbm5kb3J4Z2R6aGx5dHFreXZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNzIzMDQsImV4cCI6MjA4Nzc0ODMwNH0.O5PxSn58e0m8uy9zXSraGs9FfxCzUgVcxKF-8SqNgbU');

// 2. POVEZIVANJE NA MQTT (HIVEMQ)
const mqttClient = mqtt.connect('mqtts://8444eb8746d2443a864e05dee69c84bc.s1.eu.hivemq.cloud', { // Ovde ide onaj dugi URL
    port: 8883,
    username: 'Volta',      // Korisnik kojeg si napravio u Access Management
    password: 'Arkadavolta2026', // Šifra koju si mu dodelio
    rejectUnauthorized: false // Važno za Render da bi prihvatio SSL sertifikat
});

// POSLUŽIVANJE HTML STRANICE
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// GLAVNA RUTA ZA SKENIRANJE TIKETA
app.post('/skeniraj', async (req, res) => {
    // Uzimamo podatke koje je poslao telefon (iz index.html)
    const { email, tiketId, aparatId } = req.body;
    
    console.log(`Pokušaj prijave: Email: ${email}, Tiket: ${tiketId}, Aparat: ${aparatId}`);

    try {
        // KORAK 1: Provjera da li je ovaj tiket (barcode) već iskorišten
        const { data: postojeciTiket, error: fetchError } = await supabase
            .from('tiketi')
            .select('*')
            .eq('barcode', tiketId) // Pretpostavljam da se kolona u bazi zove 'barcode'
            .single();

        // SCENARIO B: Tiket je već u bazi (već je odigran)
        if (postojeciTiket) {
            console.log("Greška: Tiket je već iskorišten.");
            return res.status(400).json({ success: false, message: "Ovaj tiket je već iskorišćen!" });
        }

        // SCENARIO A: Tiket je nov, upisujemo ga u bazu
        const { error: insertError } = await supabase
            .from('tiketi')
            .insert([{ 
                email: email, 
                barcode: tiketId, 
                arena_id: aparatId || 'APARAT_1',
                vreme_prijave: new Date() 
            }]);

        if (insertError) throw insertError;

        // KORAK 2: Šaljemo komandu ESP32 uređaju preko MQTT-a da se upali
        mqttClient.publish(`arene/${aparatId || 'APARAT_1'}/komanda`, `START:${tiketId}`);

        console.log("Tiket uspešno aktiviran!");
        res.json({ success: true, message: "Tiket uspešno aktiviran! Srećno!" });

    } catch (err) {
        console.error("Greška na serveru:", err);
        res.status(500).json({ success: false, message: "Greška na serveru prilikom provere tiketa." });
    }
});

// OSTALE FUNKCIJE (MQTT REZULTATI I CRON)
mqttClient.on('connect', () => mqttClient.subscribe('arene/rezultati'));
mqttClient.on('message', async (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        await supabase.from('turnir').insert([{
            barcode: data.barcode,
            vreme_igre: data.score,
            pogodaka: data.pogodaka,
            promasaja: data.promasaja
        }]);
    } catch (e) {
        console.log("Greška pri obradi rezultata sa ESP32");
    }
});

cron.schedule('0 0 * * 0', async () => {
    await supabase.from('turnir').update({ aktivna_sedmica: false }).eq('aktivna_sedmica', true);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
