import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

const firebaseConfig = {
    apiKey: "AIzaSyCBZZo8qJgagGzMsz0KJJBCjGKJpw-KiJA",
    authDomain: "samochod-35d67.firebaseapp.com",
    projectId: "samochod-35d67",
    storageBucket: "samochod-35d67.firebasestorage.app",
    messagingSenderId: "12615898802",
    appId: "1:12615898802:web:7c016dc01fc1b046bf9bab"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'us-central1');
