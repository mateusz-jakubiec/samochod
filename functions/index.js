const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const Anthropic = require('@anthropic-ai/sdk');

setGlobalOptions({ maxInstances: 5 });

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

exports.scanInvoice = onCall(
    {
        secrets: [anthropicApiKey],
        cors: true,
    },
    async (request) => {
        // Tylko zalogowany użytkownik może wywołać tę funkcję
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Musisz byc zalogowany');
        }

        const { base64Image, mediaType } = request.data;

        if (!base64Image || !mediaType) {
            throw new HttpsError('invalid-argument', 'Brak obrazu');
        }

        const client = new Anthropic({ apiKey: anthropicApiKey.value() });

        const response = await client.messages.create({
            model: 'claude-opus-4-5',
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

        try {
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('Brak JSON w odpowiedzi');
            return JSON.parse(match[0]);
        } catch {
            throw new HttpsError('internal', 'Nie udalo sie sparsowac odpowiedzi Claude');
        }
    }
);
