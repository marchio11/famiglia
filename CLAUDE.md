# Casa Marchionni — app di gestione familiare

App di gestione familiare per 3 persone (Andrea, Laura, Claudia).

## Obiettivo

Alternativa a FamilyWall: niente pubblicità, semplice, solo le sezioni utili.

## Tecnologia

- Web app installabile (PWA), usata soprattutto su Android, compatibile con iPhone
  (al momento usiamo tutti dispositivi Android).
- Pubblicata gratis su Firebase Hosting (`https://casa-marchionni.web.app`).
- Firebase (piano gratuito) per sincronizzazione in tempo reale, oppure
  un'alternativa altrettanto valida (servizi Google? da approfondire).
  Requisiti: uso offline e login con Google.
- Ognuno entra col proprio account Google personale: l'app mostra chi ha
  aggiunto cosa.

### Decisioni prese

- **Vincolo assoluto: solo servizi gratuiti**, utilizzabili senza carta di
  credito e senza rischio di addebiti.
- Pubblicazione: **Firebase Hosting** (`https://casa-marchionni.web.app`),
  gratis nel piano Spark. Prima era GitHub Pages, abbandonato dopo la
  sospensione dell'account GitHub (novembre 2026). `firebase.json` +
  `.firebaserc` nel repo. Di norma la pubblicazione è automatica (vedi
  sotto); a mano, da un computer, con
  `npx firebase-tools deploy --only hosting` (MAI senza `--only hosting`:
  `firestore.rules` nel repo è solo un modello con email finte). Istruzioni
  passo passo in `PUBBLICARE-SU-FIREBASE.txt`. Il dominio web.app è già
  autorizzato in automatico per il login Firebase.
  Pubblicazione automatica: `.github/workflows/firebase.yml` pubblica su
  Firebase a ogni push sul branch (serve il secret
  `FIREBASE_SERVICE_ACCOUNT_CASA_MARCHIONNI`, creato con
  `npx.cmd firebase-tools init hosting:github`; senza secret il passo viene
  saltato). Quindi: push sul branch = app aggiornata in ~2 minuti.
  GitHub Pages è stato spento (novembre 2026) dopo il passaggio di tutti alla
  nuova app; GitHub resta come archivio del codice e motore degli
  aggiornamenti.
- Dati condivisi (Fase 2): **Firebase Firestore** sul piano gratuito **Spark**
  (tempo reale, offline integrato) + **Firebase Authentication** con Google.
- File dei documenti (Fase 4): **Google Drive** dell'account di famiglia
  (Firebase Storage gratuito oggi richiede la fatturazione attiva → escluso).
- Calendario (Fase 3): **Google Calendar API** sul calendario "Famiglia".
- Codice: HTML/CSS/JavaScript puro (moduli ES), **nessun build step**, così
  i file del repo vengono pubblicati così come sono.

### Struttura del codice

- `index.html` — punto di ingresso; `manifest.webmanifest` + `sw.js` per la PWA
  (offline). Ogni volta che si modificano i file, aumentare `VERSION` in `sw.js`:
  il numero compare in fondo alla home ("versione N"). Il service worker
  scarica i file con `cache: 'reload'` (su Firebase Hosting i file js/css/html sono no-cache), l'app
  controlla aggiornamenti quando torna in primo piano e si ricarica da sola.
- `css/style.css` — grafica (tema chiaro/scuro automatico). Stile "Vivace"
  (scelto dalla famiglia, che usa il tema scuro): riquadri della home pieni di
  colore con sfumatura, "In evidenza" su sfondo viola-notte con titolo a
  gradiente (il saluto resta bianco), intestazioni e pulsanti a gradiente;
  nella Spesa e nelle Liste (contenitore `.cat-groups`) ogni categoria ha un
  colore a rotazione (`--g`), nelle altre pagine i titoli usano il colore
  della sezione (`--c`). Etichette (`.tag`) nel tema scuro: scritta quasi
  bianca su sfondo colorato per tipo (rosso urgente/scaduto/priorità alta,
  arancione oggi-domani, lilla prossimi giorni, colore persona per i privati).
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
- `js/ocr.js` — interpreta il testo letto: tipo di documento, date con
  significato (scadenza, rilascio, nascita, immatricolazione, ultima
  revisione: vince la parola chiave più vicina sulla stessa riga), targa.
  Funzioni pure, testabili con node.
- OCR = Google Drive (gratis): `drive.readText()` copia il file convertendolo
  in Google Doc (`ocrLanguage=it`), esporta il testo e cancella la copia.
  Funziona su foto e PDF già presenti (menu ⋯ "Leggi e trova scadenze") e
  su foto nuove ("Fotografa e leggi"). Le foto vengono ridotte (max 2400 px,
  JPEG) prima del caricamento. Una scadenza creata così conserva il link al
  documento (`docLink`, `docName`).
- Ricerca: `drive.search()` usa `fullText contains` di Drive (che indicizza
  anche il testo di foto e PDF, compresi quelli importati) e tiene solo i
  file dentro "Casa Marchionni" (albero delle cartelle ricostruito e tenuto
  10 minuti in memoria).
- `js/viaggi.js` — viaggi in Firestore `viaggi` ({name, emoji, destination,
  start, end, who, notes, eventId, folderId}). Le liste del viaggio sono
  normali `lists` con `tripId` (escluse dalla pagina Liste); il programma è
  una lista con `program: true` e una categoria per giorno (id = data), voci
  con `time` facoltativo. Evento di più giorni nel calendario Famiglia con
  `who` = chi parte; cartella Drive `Casa Marchionni/Viaggi/<anno> <nome>`
  (id in `config/drive.sections.viaggi`).
- `js/offline.js` — documenti salvati sul telefono (Cache Storage
  "casa-offline", elenco in localStorage `cm:offline`): si aprono senza rete
  (foto nel visualizzatore interno, PDF con il visualizzatore del telefono).
  Il service worker cancella solo le cache `casa-vN`, mai "casa-offline".
- Collezioni **private** (`store.PRIVATE`): `privLists`/`privItems` → nel
  database `users/<uid>/lists` e `users/<uid>/listItems`, leggibili solo dal
  proprietario (regole). `store.connect(uid)` le aggiunge all'ascolto.
- `js/photos.js` — foto dei prodotti della spesa: caricate (ridotte a 1600 px)
  in `Casa Marchionni/Lista della spesa` (id in `config/drive.sections.spesa`);
  nel prodotto `photoId`, `photoLink`, `photoFolder`, `thumb` (anteprima
  ~10 KB come data URL). Eliminando il prodotto la foto va nel cestino di
  Drive dopo 8 s (tasto "Annulla"), tramite una coda in localStorage
  (`cm:photoDeletes`) eseguita quando c'è il permesso Google.
- `js/backup.js` — backup automatico giornaliero di Firestore su Drive: il
  primo telefono che apre l'app nel giorno, con permesso Google attivo e dati
  arrivati dal server (`store.synced()`), salva `backup-AAAA-MM-GG.json` in
  `Casa Marchionni/Backup app` (id in `config/drive.sections.backup`) con
  tutte le collezioni, comprese le liste private di chi lo fa
  (`privLists`/`privItems`, scelta della famiglia). Data dell'ultimo backup in
  `config/backup` ({lastDay, by}), così si fa una volta al giorno per tutti.
  Si tengono le ultime 30 copie (le altre nel cestino di Drive). Niente
  ripristino dall'app: in caso di bisogno si legge il JSON (struttura
  `collections.<nome>.<id>`) e si reinseriscono i dati a mano/con uno script.
- `js/novita.js` — note di rilascio: finestra "Novità" mostrata una volta per
  telefono dopo un aggiornamento (`RELEASE` = numero di versione) e link
  "✨ Novità" in fondo alla home. Aggiungere una voce in `NOTES` quando si
  pubblicano novità per la famiglia.
- `firestore.rules` — modello delle regole (accesso solo ai 3 indirizzi email;
  `users/{uid}/…` solo al proprietario).
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
   Anche le categorie iniziali si possono rinominare o eliminare (override in
   `spesaCats` con lo stesso id, `hidden: true` se eliminate; "Altro" non si
   elimina); ordine delle categorie modificabile trascinando la maniglia ⠿ (pointer events, scorrimento automatico ai bordi) (salvato in
   `config/spesaOrder`, vale per tutti; le nuove categorie vanno prima di
   "Altro"); "Ripristina le categorie iniziali" toglie override e ordine.
   Il trascinamento c'è anche per le categorie interne delle Liste.
   Due modi di aggiungere: veloce (categoria automatica) o con dettagli
   (categoria, quantità, urgente, **foto** già in fase di inserimento: "Scatta"
   apre direttamente la fotocamera con `capture="environment"`, "Galleria" le
   foto del telefono).
2. **Da fare** (to-do; nell'app tutto in italiano: "Da fare", filtri In corso/Miei/Completati) — assegnatari (una, due o tutte e tre le persone; nessuno =
   tutti; campo `assignees` array, compatibile col vecchio `assignee`),
   scadenza, priorità.
3. **Liste generiche** — raggruppate per tipo (Acquisti, Luoghi da visitare,
   Cose da fare, Altro); ogni lista può avere categorie interne (es. Pizzerie,
   Cinesi…). I luoghi hanno indirizzo con link a Google Maps. Liste
   **private** (🔒, solo per chi le crea; si può passare da condivisa a privata
   e viceversa da "Modifica lista": lista e voci vengono spostate).
4. **Calendario** — Google Calendar condiviso "Famiglia".
   - Schermata: riquadro "Prossimi impegni" (3 eventi) + griglia del mese
     (lunedì-domenica, pallini colorati: arancione Famiglia, colore della
     persona se l'evento riguarda una sola persona, colore dell'utente per i
     privati), scorrimento a destra/sinistra o frecce per cambiare mese,
     tasto "Oggi"; toccando un giorno compaiono i suoi eventi. Eventi del mese
     scaricati con `gcal.fetchMonth()` e copiati per mese in localStorage.
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
   - File ordinabili (Più recenti per data di aggiunta su Drive, Meno recenti,
     Nome A-Z; scelta ricordata sul telefono) e spostabili ("Sposta in…" dal
     menu ⋯, anche le cartelle) con una finestra che naviga le cartelle.
   - Al livello di un elemento (persona, veicolo…) solo scadenze e
     sottocartelle: i documenti si caricano nelle sottocartelle (file messi
     lì direttamente da Drive compaiono come "Altri documenti").
   - Gestione scadenze per ogni elemento, con "Rinnovata" che propone la
     prossima data; in home compaiono 30 giorni prima.
     Anche il riquadro "Prossime scadenze" in cima ai Documenti mostra solo
     quelle entro 30 giorni (e le scadute); le altre si vedono nell'elemento.
   - Configurazione: cartella "Casa Marchionni" creata dall'account di
     famiglia e condivisa come Editor; API Google Drive abilitata.
6. **Viaggi** — ogni viaggio raccoglie: date, destinazione (link a Maps),
   chi parte, programma giorno per giorno (con orari), liste create vuote
   (posti da visitare, valigia con una sezione per ogni persona che parte,
   da fare prima di partire, altre a piacere), documenti su Drive con lettura automatica e salvataggio sul
   telefono per l'uso offline, note. Tutti vedono tutto; "In evidenza" solo
   per chi parte: conto alla rovescia nei 30 giorni prima, durante il
   viaggio il programma di oggi. Niente gestione spese (non serve).
7. **Schermata iniziale**
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
- Lettura automatica dei documenti (OCR tramite Google Drive) e ricerca nel
  testo dei documenti: fatte ✅ (sempre con conferma dell'utente).

## Piano

- **Fase 1**: struttura, grafica, Spesa, To-do, Liste (funzionanti anche
  prima dell'integrazione con Google). ✅
- **Fase 2**: Firebase + login (o alternativa). ✅
- **Fase 3**: Calendario. ✅
- **Fase 4**: Documenti e scadenze. ✅

## Preferenze di lavoro

- Tono amichevole, in italiano.
- Spiegare i passaggi di configurazione Google/Firebase passo passo.
