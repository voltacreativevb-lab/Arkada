const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const mqtt = require('mqtt');
const cors = require('cors');
const path = require('path');
const crypto = require('node:crypto');

const app = express();
app.use(cors());
app.use(express.json());

// =========================
// CONFIG
// =========================
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MQTT_URL = process.env.MQTT_URL;
const MQTT_PORT = Number(process.env.MQTT_PORT || 8883);
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Nedostaju SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY.');
}

if (!MQTT_URL || !MQTT_USERNAME || !MQTT_PASSWORD) {
    throw new Error('Nedostaju MQTT_URL, MQTT_USERNAME ili MQTT_PASSWORD.');
}

// Server-side Supabase treba da koristi service role / secret ključ, ne anon ključ. :contentReference[oaicite:1]{index=1}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const mqttClient = mqtt.connect(MQTT_URL, {
    port: MQTT_PORT,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    rejectUnauthorized: false
});

// =========================
// HELPERS
// =========================
function getSerbianDate() {
    const now = new Date();
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}

function getStartOfCurrentWeek() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isValidPursLink(link) {
    try {
        const url = new URL(String(link || '').trim());
        return (
            url.protocol === 'https:' &&
            url.hostname === 'suf.purs.gov.rs' &&
            url.pathname === '/v/' &&
            url.searchParams.has('vl')
        );
    } catch {
        return false;
    }
}

function normalizePursLink(link) {
    const url = new URL(String(link || '').trim());
    const vl = url.searchParams.get('vl');
    return `https://suf.purs.gov.rs/v/?vl=${encodeURIComponent(vl)}`;
}

function getVlToken(link) {
    const url = new URL(String(link || '').trim());
    return url.searchParams.get('vl');
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateGameId() {
    return `game_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Traži vrednost po mogućim nazivima ključeva bilo gde u JSON stablu
function deepFindFirst(obj, candidateKeys) {
    const lowerSet = new Set(candidateKeys.map(k => k.toLowerCase()));

    function walk(node) {
        if (!node || typeof node !== 'object') return null;

        if (Array.isArray(node)) {
            for (const item of node) {
                const found = walk(item);
                if (found !== null && found !== undefined) return found;
            }
            return null;
        }

        for (const [key, value] of Object.entries(node)) {
            if (lowerSet.has(key.toLowerCase()) && value !== null && value !== undefined && value !== '') {
                return value;
            }
        }

        for (const value of Object.values(node)) {
            const found = walk(value);
            if (found !== null && found !== undefined) return found;
        }

        return null;
    }

    return walk(obj);
}

// Iz JSON-a pokušava da izvuče korisne metapodatke.
// Ako se nazivi polja razlikuju na tvom realnom odgovoru, ovde se lako doteraju.
function extractReceiptMetadata(payload) {
    const status =
        deepFindFirst(payload, ['status', 'invoiceStatus', 'receiptStatus', 'verificationStatus']) || null;

    const pfrNumber =
        deepFindFirst(payload, ['pfrNumber', 'pfr', 'invoiceNumber', 'receiptNumber', 'number']) || null;

    const totalAmount =
        deepFindFirst(payload, ['totalAmount', 'total', 'amount', 'invoiceAmount']) || null;

    const receiptTime =
        deepFindFirst(payload, ['dateTime', 'issueDateTime', 'invoiceDateTime', 'time', 'receiptTime']) || null;

    const tin =
        deepFindFirst(payload, ['tin', 'pib', 'taxId']) || null;

    const locationId =
        deepFindFirst(payload, ['businessPremiseId', 'premiseId', 'locationId', 'posId', 'cashRegisterId']) || null;

    return {
        status,
        pfrNumber: pfrNumber ? String(pfrNumber) : null,
        totalAmount: totalAmount !== null && totalAmount !== undefined ? String(totalAmount) : null,
        receiptTime: receiptTime ? String(receiptTime) : null,
        tin: tin ? String(tin) : null,
        locationId: locationId ? String(locationId) : null
    };
}

// Najbezbednije za duplikate: hash normalizovanog vl tokena.
// Ovo je razumna izvedena logika zato što je QR kod verifikacioni URL računa. :contentReference[oaicite:2]{index=2}
function makeReceiptHashFromLink(link) {
    const normalized = normalizePursLink(link);
    return sha256(normalized);
}

async function fetchPursJson(verificationUrl) {
    const response = await fetch(verificationUrl, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'VoltaArena/1.0'
        }
    });

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!response.ok) {
        throw new Error(`PURS odgovor nije OK (${response.status}).`);
    }

    if (!contentType.includes('application/json')) {
        throw new Error('PURS nije vratio JSON odgovor.');
    }

    try {
        return JSON.parse(text);
    } catch {
        throw new Error('PURS JSON nije moguće parsirati.');
    }
}

// =========================
// STATIC FILES
// =========================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/leaderboard.html', (req, res) => res.sendFile(path.join(__dirname, 'leaderboard.html')));

// =========================
// ROUTES
// =========================
app.post('/skeniraj', async (req, res) => {
    const { email, verificationUrl, aparatId } = req.body;
    const cleanEmail = normalizeEmail(email);
    const cleanUrl = String(verificationUrl || '').trim();
    const aId = String(aparatId || 'APARAT_1').trim();

    try {
        if (!isValidEmail(cleanEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Unesite ispravan email.'
            });
        }

        if (!isValidPursLink(cleanUrl)) {
            return res.status(400).json({
                success: false,
                message: 'Link sa fiskalnog računa nije ispravan.'
            });
        }

        const normalizedUrl = normalizePursLink(cleanUrl);
        const receiptHash = makeReceiptHashFromLink(normalizedUrl);
        const vlToken = getVlToken(normalizedUrl);

        // 1. Duplikat: ako je isti račun već prijavljen, odbij odmah
        const { data: existingClaim, error: existingClaimErr } = await supabase
            .from('receipt_claims')
            .select('id, game_id')
            .eq('receipt_hash', receiptHash)
            .maybeSingle();

        if (existingClaimErr) throw existingClaimErr;

        if (existingClaim) {
            return res.status(400).json({
                success: false,
                message: 'Račun je već iskorišćen.'
            });
        }

        // 2. Čitanje PURS JSON-a
        let pursPayload;
        try {
            pursPayload = await fetchPursJson(normalizedUrl);
        } catch (err) {
            console.error('PURS fetch error:', err.message);
            return res.status(502).json({
                success: false,
                message: 'PURS trenutno nije vratio validan odgovor. Pokušajte ponovo.'
            });
        }

        const meta = extractReceiptMetadata(pursPayload);

        // 3. Ako nađeš status koji deluje kao nevalidan, odbij
        const statusValue = (meta.status || '').toString().toLowerCase();
        const definitelyBadStatuses = [
            'invalid',
            'neispravan',
            'nevalidan',
            'suspicious',
            'rejected',
            'storniran',
            'cancelled',
            'canceled'
        ];

        if (definitelyBadStatuses.some(s => statusValue.includes(s))) {
            return res.status(400).json({
                success: false,
                message: 'Račun nije validan.'
            });
        }

        // 4. Upis claim-a i tiketa
        const gameId = generateGameId();

        const { error: insertClaimErr } = await supabase
            .from('receipt_claims')
            .insert([{
                receipt_hash: receiptHash,
                game_id: gameId,
                verification_url_hash: sha256(vlToken),
                aparat_id: aId,
                player_email: cleanEmail,
                pfr_number: meta.pfrNumber,
                receipt_time: meta.receiptTime,
                total_amount: meta.totalAmount,
                tin: meta.tin,
                location_id: meta.locationId,
                created_at: getSerbianDate()
            }]);

        if (insertClaimErr) {
            // Ako je unique constraint okinuo u međuvremenu
            if (String(insertClaimErr.message || '').toLowerCase().includes('duplicate')) {
                return res.status(400).json({
                    success: false,
                    message: 'Račun je već iskorišćen.'
                });
            }
            throw insertClaimErr;
        }

        const { error: insertTicketErr } = await supabase
            .from('tiketi')
            .insert([{
                email: cleanEmail,
                barcode: gameId,
                arena_id: aId,
                vreme_prijave: getSerbianDate(),
                aktivna_sedmica: 1
            }]);

        if (insertTicketErr) throw insertTicketErr;

        // 5. Start igre
        mqttClient.publish(`arene/${aId}/komanda`, `START:${gameId}`);

        console.log('🎮 PURS prijava OK:', {
            gameId,
            aparatId: aId,
            email: cleanEmail,
            pfrNumber: meta.pfrNumber,
            receiptTime: meta.receiptTime
        });

        return res.json({
            success: true,
            gameId
        });
    } catch (err) {
        console.error('Greška /skeniraj:', err);
        return res.status(500).json({
            success: false,
            message: 'Greška na serveru.'
        });
    }
});

app.get('/proveri-rezultat', async (req, res) => {
    const { gameId } = req.query;
    if (!gameId) {
        return res.status(400).json({ pronadjen: false });
    }

    try {
        const ponedeljak = getStartOfCurrentWeek();

        const { data: rezultat, error } = await supabase
            .from('turnir')
            .select('finalni_skor')
            .eq('barcode', gameId)
            .order('datum', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        if (!rezultat) {
            return res.json({ pronadjen: false });
        }

        const { count, error: countErr } = await supabase
            .from('turnir')
            .select('*', { count: 'exact', head: true })
            .gte('datum', ponedeljak)
            .gt('finalni_skor', rezultat.finalni_skor);

        if (countErr) throw countErr;

        return res.json({
            pronadjen: true,
            skor: rezultat.finalni_skor,
            mesto: (count || 0) + 1
        });
    } catch (err) {
        console.error('Greška pri rangiranju:', err.message);
        return res.status(500).json({ error: 'Greška na serveru' });
    }
});

// =========================
// MQTT
// =========================
mqttClient.on('connect', () => {
    mqttClient.subscribe('arene/rezultati');
    console.log('📡 MQTT Online!');
});

mqttClient.on('message', async (topic, message) => {
    try {
        const resData = JSON.parse(message.toString());
        const cistBarcode = resData.barcode ? String(resData.barcode).replace(/\s+/g, '') : null;

        if (!cistBarcode) return;

        const { data: provera, error: proveraErr } = await supabase
            .from('tiketi')
            .select('barcode')
            .eq('barcode', cistBarcode)
            .maybeSingle();

        if (proveraErr) throw proveraErr;
        if (!provera) return;

        const podaciZaUpis = {
            barcode: cistBarcode,
            aparat_id: resData.aparat_id || 'APARAT_1',
            pogodaka: parseInt(resData.pogodaka, 10) || 0,
            promasaja: parseInt(resData.promasaja, 10) || 0,
            vreme_igre: parseInt(resData.vreme_igre, 10) || 0,
            finalni_skor: parseInt(resData.finalni_skor, 10) || 0,
            datum: getSerbianDate(),
            aktivna_sedmica: 1
        };

        const { error: insertTurnirErr } = await supabase
            .from('turnir')
            .insert([podaciZaUpis]);

        if (insertTurnirErr) throw insertTurnirErr;

        console.log(`🏆 Rezultat snimljen za: ${cistBarcode}`);
    } catch (e) {
        console.error('MQTT Error:', e.message);
    }
});

// =========================
// LEADERBOARD
// =========================
app.get('/api/rang-lista', async (req, res) => {
    try {
        const ponedeljak = getStartOfCurrentWeek();

        const { data: rez, error } = await supabase
            .from('turnir')
            .select('finalni_skor, barcode, tiketi(email)')
            .gte('datum', ponedeljak)
            .order('finalni_skor', { ascending: false })
            .limit(50);

        if (error) throw error;

        const leaderboard = (rez || []).map(r => ({
            prikaz_imena: r.tiketi?.email
                ? r.tiketi.email.split('@')[0] + '@...'
                : 'Igrač',
            finalni_skor: r.finalni_skor
        }));

        return res.json(leaderboard);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 VOLTA Server Online na portu ${PORT}`);
});
