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
  (offline). Ogni volta che si modificano i file, aumentare `VERSION` in `sw.js`:
  il numero compare in fondo alla home ("versione N"). Il service worker
  scarica i file con `cache: 'reload'` (GitHub Pages ha max-age 10 min), l'app
  controlla aggiornamenti quando torna in primo piano e si ricarica da sola.
- `css/style.css` — grafica (tema chiaro/scuro automatico).
- `js/store.js` — strato dati con API sincrona (`getAll`, `get`, `add`,
  `update`, `set`, `remove`, `restore`, `subscribe`). Due modalità:
  - **locale** se `js/firebase-config.js` è `null` (dati in `localStorage`);
  - **cloud** se è compilato: cache in memoria alimentata da `onSnapshot` di
    Firestore, scritture inviate a Firestore senza attendere (offline-first).
- `js/cloud.js` — Firebase SDK da CDN gstatic (versione fissa 11.10.0, nessun
  build step): login Google (popup, ripiego su redirect) + Firestore con cache
  persistente. Collezioni top-level: `spesa`, `spesaCats` (categorie
  personalizzate della spesa), `spesaMemo` (categoria ricordata per prodotto),
  `todo`, `lists` (con `type`: acquisti/luoghi/cose/altro e `sections`:
  categorie interne `[{id, name}]`), `listItems` (con `section`, e `place`
  per i luoghi).
- `js/gcal.js` — Google Calendar API v3 chiamata dal browser con un token
  OAuth ottenuto da `reauthenticateWithPopup` di Firebase (scope
  `calendar.events` + `calendar.calendarlist.readonly`, durata ~1 ora, va
  richiesto con un tocco). Calendario "Famiglia" trovato per nome nella
  calendarList; eventi privati nel calendario `primary` dell'utente. Gli
  eventi (prossimi 60 giorni) sono copiati in localStorage per account
  (`cm:cal:<uid>:cache`) e usati da home e agenda anche senza token/rete.
- `js/google.js` — permesso Google unico (token ~1 ora, chiave
  `cm:g:<uid>:token2`) per Calendar + Drive, `request()` autenticata, errori.
- `js/drive.js` — Google Drive API v3 (scope `drive` completo, necessario per
  vedere le cartelle create a mano). Drive è la fonte di verità: l'app legge
  le cartelle ogni volta (copia in localStorage `cm:drive:<uid>:…` per uso
  offline). Id delle cartelle principali in Firestore `config/drive`.
  Struttura: `Casa Marchionni/{Persone/{Andrea,Laura,Claudia,Altri
  familiari/…},Veicoli,Immobili,Animali}`; sottocartelle predefinite per
  tipo (modificabili). Eliminare = cestino di Drive (o togliere dalla cartella
  se il file è di un altro account). Caricamento "resumable".
- `js/scadenze.js` — scadenze in Firestore `scadenze` ({entityId, entityName,
  kind, type, label, date, notes, eventId}) + evento tutto il giorno nel
  calendario Famiglia (promemoria 7 giorni e 1 giorno prima). Dati veicolo
  (immatricolazione) in `docInfo/<folderId>`.
- `firestore.rules` — modello delle regole (accesso solo ai 3 indirizzi email).
  Gli indirizzi veri vanno solo nella console Firebase, non nel repo.
- `js/app.js` — avvio (login in modalità cloud) e router a hash
  (`#/spesa`, `#/todo`, `#/liste/<id>`, `#/documenti/<folderId>` …). A ogni
  cambio pagina il contenitore `#app` viene sostituito: i listener aggiunti
  dalle viste su `root` non sopravvivono (evita doppie finestre).
- `js/user.js` — nome mostrato nell'app: in cloud si ricava dal nome
  dell'account Google (se è Andrea/Laura/Claudia), altrimenti si sceglie una
  volta e si ricorda per quell'account.
- `js/views/*.js` — una vista per sezione.
- Testo base 18px (`html { font-size: 112.5% }`): usare sempre `rem`.
- Niente `<input type="time">`: l'orologio nativo di Android esce dallo
  schermo con i caratteri grandi → usare menu ore/minuti (`timeField`).
- Prima di pubblicare, verificare che ogni modulo si carichi (un errore di
  sintassi blocca tutta l'app), es.
  `node -e "import('./js/views/calendario.js')"` (errori su `document`/`window`
  sono normali fuori dal browser), e provarla con Playwright.

## Sezioni

1. **Spesa** — lista condivisa, spunta, categorie (predefinite + personalizzate).
   Due modi di aggiungere: veloce (categoria automatica) o con dettagli
   (categoria, quantità, urgente già in fase di inserimento).
2. **To-do** — assegnatari (una, due o tutte e tre le persone; nessuno =
   tutti; campo `assignees` array, compatibile col vecchio `assignee`),
   scadenza, priorità.
3. **Liste generiche** — raggruppate per tipo (Acquisti, Luoghi da visitare,
   Cose da fare, Altro); ogni lista può avere categorie interne (es. Pizzerie,
   Cinesi…). I luoghi hanno indirizzo con link a Google Maps.
4. **Calendario** — Google Calendar condiviso "Famiglia".
   - Eventi/scadenze **privati** ("Solo io"): salvati nel calendario Google
     *personale* di chi li crea (gli altri non possono vederli). L'app mostra
     calendario Famiglia + calendario personale dell'utente, e anche la home
     include gli eventi privati di chi la sta guardando.
   - Eventi Famiglia con **persone coinvolte** (facoltative; nessuna = tutti),
     salvate nell'evento in `extendedProperties.shared.who` ("Andrea,Laura"):
     tutti li vedono nel calendario, ma "In evidenza" solo i coinvolti.
   - Promemoria: impostati via API valgono solo per chi crea l'evento; gli
     altri ricevono le notifiche predefinite del calendario Famiglia
     (impostazione dell'app Google Calendar di ciascuno).
   - Configurazione Google Cloud (progetto casa-marchionni): API Google
     Calendar abilitata; schermata di consenso OAuth con i 3 account come
     utenti di test (o app pubblicata): compare l'avviso "app non verificata".
5. **Documenti** (tutti vedono tutto)
   - Ordine delle sezioni: Persone, Animali, Veicoli, Immobili.
   - Persone: Andrea, Laura, Claudia + "Altri familiari" come ultima voce del
     riquadro Persone (apre la cartella con i nomi, es. nonni per
     successioni, creati anche da Drive), ognuno con sottocartelle.
   - Veicoli: Toyota Yaris, Hyundai i10, Camper (+ nuovi dall'app).
   - Immobili: una cartella per ogni immobile.
   - Animali: Tokyo (il cane).
   - Al livello di un elemento (persona, veicolo…) solo scadenze e
     sottocartelle: i documenti si caricano nelle sottocartelle (file messi
     lì direttamente da Drive compaiono come "Altri documenti").
   - Gestione scadenze per ogni elemento, con "Rinnovata" che propone la
     prossima data; in home compaiono 30 giorni prima.
   - Configurazione: cartella "Casa Marchionni" creata dall'account di
     famiglia e condivisa come Editor; API Google Drive abilitata.
6. **Schermata iniziale**
   - Parte superiore: riquadro riepilogativo con le scadenze più importanti
     (prese da to-do, calendario, lista spesa o qualunque altra lista).
     Regole attuali: to-do e voci di lista con scadenza entro 7 giorni;
     to-do a **priorità alta** (anche senza data) solo per le persone
     assegnate (o per tutti se è di tutti); eventi del calendario entro 7
     giorni (inclusi i privati di chi guarda; quelli Famiglia con persone
     coinvolte solo per loro); scadenze documenti entro 30 giorni; prodotti urgenti della spesa
     (inseriti tra le cose di oggi). Massimo 3 voci visibili, le altre si
     vedono scorrendo dentro il riquadro (contatore + barra di scorrimento
     disegnata a mano, sempre visibile: quella di Android si nasconde).
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
  prima dell'integrazione con Google). ✅
- **Fase 2**: Firebase + login (o alternativa). ✅
- **Fase 3**: Calendario. ✅
- **Fase 4**: Documenti e scadenze. ✅

## Preferenze di lavoro

- Tono amichevole, in italiano.
- Spiegare i passaggi di configurazione Google/Firebase passo passo.
