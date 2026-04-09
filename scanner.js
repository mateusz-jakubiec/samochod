import { auth } from './firebase.js';
import { getIdToken } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const FUNCTION_URL = 'https://us-central1-samochod-35d67.cloudfunctions.net/scanInvoice';

export async function scanInvoice(base64Image, mediaType) {
    const token = await getIdToken(auth.currentUser);

    const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ base64Image, mediaType })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Blad funkcji');
    }

    return response.json();
}
