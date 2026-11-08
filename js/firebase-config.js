// Configurazione del progetto Firebase "Casa Marchionni".
//
// Si trova in: console Firebase → ⚙️ Impostazioni progetto → Le tue app → Config.
// Se la si rimette a null, l'app torna in modalità locale (dati solo sul telefono).
//
// Questi valori NON sono segreti: identificano solo il progetto. La protezione
// dei dati è data dalle regole di Firestore (vedi firestore.rules), che
// permettono l'accesso solo ai tre account Google di famiglia.
export const firebaseConfig = {
  apiKey: 'AIzaSyClv_llsS7xpGcsX1VeAHqH1QSFPXJ8U0g',
  authDomain: 'casa-marchionni.firebaseapp.com',
  projectId: 'casa-marchionni',
  storageBucket: 'casa-marchionni.firebasestorage.app',
  messagingSenderId: '866029896037',
  appId: '1:866029896037:web:7863735829cfafdd42e18c',
};
