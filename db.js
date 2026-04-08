import { db } from './firebase.js';
import {
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentUid = null;

export function setCurrentUser(uid) {
    currentUid = uid;
}

function entriesRef() {
    return collection(db, 'users', currentUid, 'entries');
}

export async function addEntry(entry) {
    await addDoc(entriesRef(), entry);
}

export async function getAllEntries() {
    const q = query(entriesRef(), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getEntry(id) {
    const snap = await getDoc(doc(db, 'users', currentUid, 'entries', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateEntry(id, data) {
    await updateDoc(doc(db, 'users', currentUid, 'entries', id), data);
}

export async function deleteEntry(id) {
    await deleteDoc(doc(db, 'users', currentUid, 'entries', id));
}

export async function getLatestMileage() {
    const entries = await getAllEntries();
    if (entries.length === 0) return 0;
    return Math.max(...entries.map(e => e.mileage));
}

export async function getActiveReminders() {
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
