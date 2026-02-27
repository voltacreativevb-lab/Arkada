const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cron = require('node-cron');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// OVDE UNESI SVOJE PODATKE SA SUPABASE-A
const supabase = createClient('TVOJ_URL_OVDE', 'TVOJ_ANON_KEY_OVDE');

// OVDE UNESI SVOJE PODATKE SA HIVEMQ-A
const mqttClient = mqtt.connect('mqtts://TVOJ_CLUSTER_URL_OVDE', {
    port: 8883,
    username: 'admin',
    password: 'Sifra123'
});

// Kada telefon skenira barkod
app.post('/prijava', async (req, res) => {
    const { barcode, email, arena_id } = req.body;
    
    // Upisujemo u tabelu tiketi
    const { error } = await supabase.from('tiketi').insert([{ barcode, email, arena_id }]);
    if (error) return res.status(400).json(error);

    // Šaljemo komandu aparatu
    mqttClient.publish(`arene/${arena_id}/komanda`, `START:${barcode}`);
    res.json({ success: true });
});

// Kada aparat (ESP32) pošalje rezultat
mqttClient.on('connect', () => mqttClient.subscribe('arene/rezultati'));
mqttClient.on('message', async (topic, message) => {
    const data = JSON.parse(message.toString());
    await supabase.from('turnir').insert([{
        barcode: data.barcode,
        vreme_igre: data.score,
        pogodaka: data.pogodaka,
        promasaja: data.promasaja
    }]);
});

// Reset u nedelju u ponoć
cron.schedule('0 0 * * 0', async () => {
    await supabase.from('turnir').update({ aktivna_sedmica: false }).eq('aktivna_sedmica', true);
});

app.listen(process.env.PORT || 3000);
