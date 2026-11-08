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
- `js/store.js` — strato dati. In Fase 1 salva in `localStorage` (dati solo sul
  telefono); in Fase 2 verrà sostituito da Firestore mantenendo la stessa API
  (`getAll`, `get`, `add`, `update`, `set`, `remove`, `subscribe`).
- `js/app.js` — router a hash (`#/spesa`, `#/todo`, `#/liste/<id>` …).
- `js/views/*.js` — una vista per sezione.
- In Fase 1 l'utente si sceglie da un elenco (Andrea/Laura/Claudia); in Fase 2
  sarà sostituito dal login Google.

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
