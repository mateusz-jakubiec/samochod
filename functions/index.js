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
                max_tokens: 2048,
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
                                text: `Przeanalizuj fakture VAT za naprawe samochodu.
Zwroc WYLACZNIE JSON bez zadnego innego tekstu, bez markdown:
{
  "date": "YYYY-MM-DD lub null",
  "description": "ogolny opis np. 'Wymiana oleju i filtrow'",
  "services": [
    {"name": "nazwa uslugi", "qty": 1, "price": liczba lub null}
  ],
  "parts": [
    {"name": "nazwa czesci", "qty": liczba, "price": liczba lub null}
  ],
  "total_price": liczba lub null
}

SKAD BRAC DANE:
- Czytaj TYLKO z tabeli pozycji faktury (wiersze z Lp. 1, 2, 3...). Ignoruj notatki odreczne, opisy pod tabelka, komentarze.
- Przepisz WSZYSTKIE wiersze z tabeli - nie pomijaj zadnego.

CENY - BARDZO WAZNE:
- Jezeli faktura ma kolumny: uzyj wartosci z kolumny "Wartosc Brutto" lub "Brutto" (ostatnia kolumna, najwyzsza kwota w wierszu).
- NIGDY nie bierz wartosci z kolumny "Cena jedn. Netto", "Wartosc Netto" ani "Netto".
- price = Wartosc Brutto dla danego wiersza (ilosc * cena brutto), nie cena jednostkowa.
- total_price = laczna suma brutto z dolu faktury (np. "Wartosc Faktury VAT" lub "Razem Brutto").

KLASYFIKACJA:
- services: TYLKO praca mechanika - robocizna, diagnostyka, przeglad, naprawa, usprawnienie, serwis (sama czynnosc bez materialu). Przyklad TAK: "Usprawnienie pojazdu", "Diagnostyka komputerowa". NIE: "Olej", "Filtr", "Zbiornik".
- parts: fizyczne przedmioty i materialy - czesci, oleje, plyny, filtry, uszczelki, sruby, zbiorniki, klocki, tarcze. Przyklad TAK: "Filtr oleju", "Zbiornik plynow", "Tarcza hamulcowa". NIE: "Wymiana", "Naprawa".
- qty: ilosc z faktury (moze byc ulamkowa np. 0.4, 5.3)

- Jezeli dokument nie jest faktura serwisowa: date i description jako null, services i parts jako []`
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
