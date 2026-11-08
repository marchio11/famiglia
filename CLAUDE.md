# Casa Marchionni — app di gestione familiare

App di gestione familiare per 3 persone (Andrea, Laura, Claudia).

## Obiettivo

Alternativa a FamilyWall: niente pubblicità, semplice, solo le sezioni utili.

## Tecnologia

- Web app installabile (PWA), usata soprattutto su Android, compatibile con iPhone
  (al momento usiamo tutti dispositivi Android).
- Pubblicata gratis su GitHub Pages.
- Firebase (piano gratuito) per sincronizzazione in tempo reale, oppure
  un'alternativa altrettanto valida (servizi Google? da approfondire).
  Requisiti: uso offline e login con Google.
- Ognuno entra col proprio account Google personale: l'app mostra chi ha
  aggiunto cosa.

### Decisioni prese

- **Vincolo assoluto: solo servizi gratuiti**, utilizzabili senza carta di
  credito e senza rischio di addebiti.
- Pubblicazione: **GitHub Pages**.
- Dati condivisi (Fase 2): **Firebase Firestore** sul piano gratuito **Spark**
  (tempo reale, offline integrato) + **Firebase Authentication** con Google.
- File dei documenti (Fase 4): **Google Drive** dell'account di famiglia
  (Firebase Storage gratuito oggi richiede la fatturazione attiva → escluso).
- Calendario (Fase 3): **Google Calendar API** sul calendario "Famiglia".
- Codice: HTML/CSS/JavaScript puro (moduli ES), **nessun build step**, così
  GitHub Pages pubblica direttamente i file del repo.

### Struttura del codice

- `index.html` — punto di ingresso; `manifest.webmanifest` + `sw.js` per la PWA
  (offline). Ogni volta che si modificano i file, aumentare `VERSION` in `sw.js`.
- `css/style.css` — grafica (tema chiaro/scuro automatico).
- `js/store.js` — strato dati con API sincrona (`getAll`, `get`, `add`,
  `update`, `set`, `remove`, `restore`, `subscribe`). Due modalità:
  - **locale** se `js/firebase-config.js` è `null` (dati in `localStorage`);
  - **cloud** se è compilato: cache in memoria alimentata da `onSnapshot` di
    Firestore, scritture inviate a Firestore senza attendere (offline-first).
- `js/cloud.js` — Firebase SDK da CDN gstatic (versione fissa 11.10.0, nessun
  build step): login Google (popup, ripiego su redirect) + Firestore con cache
  persistente. Collezioni top-level: `spesa`, `todo`, `lists`, `listItems`,
  `spesaMemo`.
- `firestore.rules` — modello delle regole (accesso solo ai 3 indirizzi email).
  Gli indirizzi veri vanno solo nella console Firebase, non nel repo.
- `js/app.js` — avvio (login in modalità cloud) e router a hash
  (`#/spesa`, `#/todo`, `#/liste/<id>` …).
- `js/user.js` — nome mostrato nell'app: in cloud si ricava dal nome
  dell'account Google (se è Andrea/Laura/Claudia), altrimenti si sceglie una
  volta e si ricorda per quell'account.
- `js/views/*.js` — una vista per sezione.
- Testo base 18px (`html { font-size: 112.5% }`): usare sempre `rem`.

## Sezioni

1. **Spesa** — lista condivisa, spunta, categorie.
2. **To-do** — assegnatario, scadenza, priorità.
3. **Liste generiche** — ricette, pasti, ecc.
4. **Calendario** — Google Calendar condiviso "Famiglia".
5. **Documenti**
   - Sezioni individuali: Andrea, Laura, Claudia, con sottocartelle
     (documenti, esami medici, ecc.).
   - Sezione veicoli: Toyota Yaris, Hyundai i10, Camper.
   - Sezione immobili: una sottocartella per ogni immobile.
   - Gestione scadenze.
6. **Schermata iniziale**
   - Parte superiore: riquadro riepilogativo con le scadenze più importanti
     (prese da to-do, calendario, lista spesa o qualunque altra lista).
   - Parte inferiore: accesso alle sezioni sopra elencate.

## Account

- Account Google di famiglia: `casamarchionni@proton.me` (senza Gmail).
  È proprietario del calendario "Famiglia", della cartella Documenti e del
  progetto Firebase (o altro servizio cloud), con Andrea come secondo
  amministratore.
- I 3 account personali hanno accesso condiviso in modifica.

## Scadenze documenti

- **V1**: ogni tipo di documento ha una scadenza suggerita, sempre confermata
  dall'utente:
  - bollo auto: annuale;
  - revisione: dopo 4 anni dall'immatricolazione, poi ogni 2 anni;
  - carta d'identità / patente: dalla data stampata sul documento.
- Le scadenze diventano eventi sul Google Calendar "Famiglia" con promemoria
  (le notifiche arrivano dall'app Calendar, nessun server necessario).
- In futuro, opzionale: lettura automatica dei documenti (OCR sul telefono).

## Piano

- **Fase 1**: struttura, grafica, Spesa, To-do, Liste (funzionanti anche
  prima dell'integrazione con Google).
- **Fase 2**: Firebase + login (o alternativa).
- **Fase 3**: Calendario.
- **Fase 4**: Documenti e scadenze.

## Preferenze di lavoro

- Tono amichevole, in italiano.
- Spiegare i passaggi di configurazione Google/Firebase passo passo.
