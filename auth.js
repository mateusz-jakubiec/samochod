import { auth } from './firebase.js';
import { setCurrentUser } from './db.js';
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

export function initAuth(onLoggedIn, onLoggedOut) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            setCurrentUser(user.uid);
            onLoggedIn(user);
        } else {
            setCurrentUser(null);
            onLoggedOut();
        }
    });
}

export async function login(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
    await signOut(auth);
}
