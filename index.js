const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer'); // DODATO

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

// --- NOVO: FUNKCIJA ZA ODLAZAK NA SAJT PORESKE ---
async function ocitajPfrSaPoreske(url) {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Obavezno za Render
    });
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Čekamo da se pojavi PFR broj (na osnovu tvojih linkova, tražimo ID ili specifičan tekst)
        // Napomena: Proveri tačan ID na sajtu poreske, obično je #pfrId ili slično
        await page.waitForSelector('body'); 
        
        const podaci = await page.evaluate(() => {
            // Pokušavamo da nađemo tekst koji prati 'PFR broj računa:'
            const bodyText = document.body.innerText;
            const match = bodyText.match(/[A-Z0-9]{8}-[A-Z0-9]{8}-[0-9]+/);
            return match ? match[0] : null;
        });

        await browser.close();
        return podaci;
    } catch (e) {
        console.error("Greška pri scrapingu:", e);
        await browser.close();
        return null;
    }
}

// --- NOVO: RUTA KOJU POZIVA TVOJ QR SKENER ---
app.post('/procesuiraj-racun', async (req, res) => {
    const { url, email } = req.body;

    if (!url || !url.includes('suf.purs.gov.rs')) {
        return res.status(400).json({ success: false, message: "Nevalidan link Poreske uprave." });
    }

    try {
        const pfrBroj = await ocitajPfrSaPoreske(url);

        if (pfrBroj) {
            // Upisujemo u bazu u tabelu 'tiketi' ili novu tabelu 'racuni'
            const { error } = await supabase
                .from('tiketi')
                .insert([{ 
                    email: email, 
                    barcode: pfrBroj, // Koristimo PFR broj kao jedinstveni kod
                    vreme_prijave: new Date(),
                    napomena: 'Skeniran fiskalni račun'
                }]);

            if (error) throw error;
            res.json({ success: true, pfr: pfrBroj, message: "Račun uspešno verifikovan!" });
        } else {
            res.status(500).json({ success: false, message: "Sajt poreske nije vratio broj računa." });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Greška pri obradi računa." });
    }
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

// RUTA ZA RANG LISTU
app.get('/api/rang-lista', async (req, res) => {
    try {
        const { aparat } = req.query;
        const trenutnaSedmica = getWeekNumber(new Date());

        let query = supabase
            .from('turnir')
            .select(`
                finalni_skor,
                barcode,
                tiketi ( email )
            `)
            .eq('aktivna_sedmica', trenutnaSedmica)
            .order('finalni_skor', { ascending: false })
            .limit(10);

        if (aparat && aparat !== 'Global Network' && aparat !== 'Globalno') {
            query = query.eq('aparat_id', aparat);
        }

        const { data, error } = await query;
        if (error) throw error;

        const formatiraniPodaci = data.map(stavka => {
            const puniEmail = (stavka.tiketi && stavka.tiketi.email) ? stavka.tiketi.email : "Gost@";
            const korisnikDeo = puniEmail.split('@')[0];
            return {
                prikaz_imena: korisnikDeo + "@",
                finalni_skor: stavka.finalni_skor
            };
        });

        res.json(formatiraniPodaci);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RUTA ZA SKENIRANJE TIKETA (Standardna)
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
        res.status(500).json({ success: false, message: "Greška baze podataka." });
    }
});

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
                vreme_igre: 35, 
                finalni_skor: resultData.finalni_skor,
                aktivna_sedmica: trenutnaSedmica
            };

            const { error } = await supabase.from('turnir').insert([zaUpis]);
            if (error) console.error("Greška pri upisu:", error.message);
        } catch (e) {
            console.error("Greška pri obradi rezultata:", e);
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server radi na portu ${PORT}`));
