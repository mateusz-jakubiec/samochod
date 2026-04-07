const DB_NAME = 'serwis-auta';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('date', 'date', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addEntry(entry) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.add(entry);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllEntries() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const entries = request.result;
            entries.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
            resolve(entries);
        };
        request.onerror = () => reject(request.error);
    });
}

async function updateEntry(id, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put({ ...data, id });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getEntry(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteEntry(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getLatestMileage() {
    const entries = await getAllEntries();
    if (entries.length === 0) return 0;
    return Math.max(...entries.map(e => e.mileage));
}

async function getActiveReminders() {
    const entries = await getAllEntries();
    const latestMileage = entries.length > 0 ? Math.max(...entries.map(e => e.mileage)) : 0;

    return entries
        .filter(e => e.reminder_km != null && e.reminder_km > 0)
        .map(e => ({
            ...e,
            remaining_km: e.reminder_km - latestMileage,
            latest_mileage: latestMileage
        }))
        .sort((a, b) => a.remaining_km - b.remaining_km);
}
