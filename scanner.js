import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { functions } from './firebase.js';

export async function scanInvoice(base64Image, mediaType) {
    const fn = httpsCallable(functions, 'scanInvoice');
    const result = await fn({ base64Image, mediaType });
    return result.data;
}
