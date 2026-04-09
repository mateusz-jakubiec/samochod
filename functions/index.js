const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp();
setGlobalOptions({ maxInstances: 5 });

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

exports.scanInvoice = onRequest(
    { secrets: [anthropicApiKey], invoker: 'public' },
    async (req, res) => {
        // CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        // Weryfikacja Firebase Auth token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Musisz byc zalogowany' });
            return;
        }

        try {
            const idToken = authHeader.split('Bearer ')[1];
            await admin.auth().verifyIdToken(idToken);
            console.log('Token verified OK');
        } catch (err) {
            console.error('Token error:', err.message);
            res.status(401).json({ error: 'Nieprawidlowy token' });
            return;
        }

        const { base64Image, mediaType } = req.body;

        if (!base64Image || !mediaType) {
            res.status(400).json({ error: 'Brak obrazu' });
            return;
        }

        try {
            const client = new Anthropic({ apiKey: anthropicApiKey.value() });
            console.log('Calling Anthropic API...');

            const response = await client.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: { type: 'base64', media_type: mediaType, data: base64Image }
                            },
                            {
                                type: 'text',
                                text: `Przeanalizuj ten dokument serwisowy lub fakture za naprawe samochodu.
Wyodrebnij nastepujace dane i zwroc je jako JSON (bez zadnego innego tekstu):
{
  "date": "YYYY-MM-DD lub null jesli nie ma",
  "description": "krotki opis naprawy np. Wymiana oleju i filtrow",
  "parts": "lista czesci oddzielona przecinkami lub pusty string",
  "price": liczba lub null
}
Jezeli dokument nie jest faktura ani dokumentem serwisowym, zwroc wszystkie pola jako null.`
                            }
                        ]
                    }
                ]
            });

            const text = response.content[0].text.trim();
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('Brak JSON w odpowiedzi');
            res.json(JSON.parse(match[0]));
        } catch (err) {
            console.error('Claude error:', err.message, err.status, err.error);
            res.status(500).json({ error: 'Blad analizy', details: err.message });
        }
    }
);
