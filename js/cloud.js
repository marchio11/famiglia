// Collegamento a Firebase (login Google + database Firestore).
// Viene caricato solo se firebase-config.js è compilato.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'it';

// Cache persistente: l'app funziona anche offline e sincronizza al ritorno della rete.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});

/* ---------- Login ---------- */

export function watchAuth(cb) {
  getRedirectResult(auth).catch((e) => console.warn('Login (redirect)', e));
  return onAuthStateChanged(auth, cb);
}

export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // Se la finestra di login non può aprirsi, si passa al reindirizzamento.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export const logout = () => signOut(auth);

/* ---------- Dati ---------- */

/** Ascolta le collezioni in tempo reale. */
export function listen(cols, onData, onError) {
  const unsubs = cols.map((col) =>
    onSnapshot(
      collection(db, col),
      (snap) => {
        const map = {};
        snap.forEach((d) => { map[d.id] = { ...d.data(), id: d.id }; });
        onData(col, map, snap.metadata.fromCache);
      },
      onError,
    ));
  return () => unsubs.forEach((u) => u());
}

// Le scritture vengono applicate subito in locale; la promessa si risolve solo
// quando il server conferma (o mai, se offline), quindi non va attesa.
export const write = (col, id, obj) => setDoc(doc(db, col, id), obj);
export const patch = (col, id, p) => updateDoc(doc(db, col, id), p);

export function removeMany(col, ids) {
  const b = writeBatch(db);
  ids.forEach((id) => b.delete(doc(db, col, id)));
  return b.commit();
}

export function writeMany(col, items) {
  const b = writeBatch(db);
  items.forEach((it) => b.set(doc(db, col, it.id), it));
  return b.commit();
}
