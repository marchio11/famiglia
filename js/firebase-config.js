// Configurazione del progetto Firebase "Casa Marchionni".
//
// Finché è null, l'app funziona in modalità locale (dati solo sul telefono).
// Si trova in: console Firebase → ⚙️ Impostazioni progetto → Le tue app → Config.
//
// Questi valori NON sono segreti: identificano solo il progetto. La protezione
// dei dati è data dalle regole di Firestore (vedi firestore.rules), che
// permettono l'accesso solo ai tre account Google di famiglia.
export const firebaseConfig = null;

// Esempio di come apparirà:
// export const firebaseConfig = {
//   apiKey: 'AIza…',
//   authDomain: 'casa-marchionni.firebaseapp.com',
//   projectId: 'casa-marchionni',
//   storageBucket: 'casa-marchionni.firebasestorage.app',
//   messagingSenderId: '1234567890',
//   appId: '1:1234567890:web:abc123',
// };
