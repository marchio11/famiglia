import * as store from '../store.js';
import { esc, byWho, toast, formDialog, pageHead } from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-spesa)';

export const CATS = [
  { id: 'frutta', name: 'Frutta e verdura', emoji: '🥦' },
  { id: 'carne', name: 'Carne e pesce', emoji: '🥩' },
  { id: 'latticini', name: 'Latte, uova e formaggi', emoji: '🧀' },
  { id: 'forno', name: 'Pane e forno', emoji: '🥖' },
  { id: 'dispensa', name: 'Dispensa', emoji: '🥫' },
  { id: 'surgelati', name: 'Surgelati', emoji: '🧊' },
  { id: 'bevande', name: 'Bevande', emoji: '🧃' },
  { id: 'casa', name: 'Casa e pulizia', emoji: '🧽' },
  { id: 'igiene', name: 'Igiene e salute', emoji: '🧴' },
  { id: 'altro', name: 'Altro', emoji: '🛒' },
];

// Parole (inizio di parola) per indovinare la categoria. Vince la più lunga.
const KEYWORDS = {
  frutta: ['mel', 'pera', 'pere', 'banan', 'aranc', 'limon', 'insalat', 'pomodor', 'zucchin', 'zucca', 'patat', 'cipoll', 'aglio', 'carot', 'frutta', 'verdur', 'fragol', 'uva', 'kiwi', 'spinac', 'broccol', 'cavol', 'peperon', 'funghi', 'basilico', 'prezzemolo', 'lattuga', 'rucola', 'finocc', 'sedano', 'avocado', 'mandarin', 'clementin', 'pesc', 'albicocc', 'ciliegi', 'anguria', 'ananas', 'cetriol', 'carciof', 'asparag', 'radicchio', 'fagiolini', 'rosmarino', 'salvia', 'mirtill', 'lampon', 'prugn', 'fichi', 'castagne', 'noci', 'mandorle'],
  carne: ['pollo', 'petto di pollo', 'manzo', 'maiale', 'carne', 'macinato', 'prosciutt', 'salam', 'bresaola', 'mortadella', 'tacchino', 'salsicc', 'hamburger', 'pesce', 'salmone', 'merluzzo', 'gamber', 'vitello', 'wurstel', 'würstel', 'speck', 'pancetta', 'orata', 'branzino', 'cozze', 'vongole', 'calamar', 'polpo', 'seppi', 'agnello', 'coniglio', 'arrosto', 'bistecc', 'fettine', 'cotolett', 'affettat', 'coppa', 'cotechino', 'tonno fresco'],
  latticini: ['latte', 'yogurt', 'burro', 'formagg', 'mozzarell', 'parmigian', 'grana', 'ricotta', 'uova', 'uovo', 'panna', 'stracchino', 'pecorino', 'mascarpone', 'gorgonzola', 'scamorza', 'philadelphia', 'fontina', 'emmental', 'provola', 'burrata', 'squacquerone', 'crescenza', 'kefir', 'sottilette', 'asiago'],
  forno: ['pane', 'panin', 'grissini', 'cracker', 'fette biscottate', 'piadin', 'focaccia', 'brioche', 'cornett', 'pizza', 'toast', 'pan carrè', 'pancarrè', 'tarall', 'friselle', 'crostata', 'torta', 'pangrattato', 'tramezzini'],
  dispensa: ['pasta', 'spaghetti', 'penne', 'fusilli', 'rigatoni', 'tortellini', 'gnocchi', 'lasagne', 'riso', 'farina', 'zucchero', 'sale', 'olio', 'aceto', 'caffè', 'caffe', 'cialde', 'capsule', 'tè', 'the', 'tisan', 'camomilla', 'biscott', 'tonno', 'passata', 'pelati', 'polpa', 'legumi', 'ceci', 'fagioli', 'lenticchie', 'marmellat', 'confettur', 'miele', 'nutella', 'cereali', 'muesli', 'sugo', 'ragù', 'pesto', 'spezie', 'pepe', 'origano', 'lievito', 'cioccolat', 'merendin', 'orzo', 'dado', 'brodo', 'maionese', 'ketchup', 'senape', 'olive', 'capperi', 'sottoli', 'mais', 'patatine', 'snack', 'cous', 'quinoa', 'farro', 'polenta', 'cacao', 'gallette', 'fette', 'sgombro', 'acciughe'],
  surgelati: ['surgelat', 'gelat', 'bastoncini', 'minestrone', 'piselli', 'sofficini', 'spinaci surgelati', 'ghiaccio', 'frozen'],
  bevande: ['acqua', 'vino', 'birra', 'succo', 'succhi', 'coca', 'aranciata', 'bibit', 'spremuta', 'tè freddo', 'the freddo', 'estathe', 'prosecco', 'spumante', 'latte di', 'bevanda', 'gassosa', 'chinotto', 'sprite', 'fanta', 'amaro', 'liquore', 'tonica', 'energy'],
  casa: ['detersiv', 'ammorbident', 'carta', 'scottex', 'rotoloni', 'sacchetti', 'sacchi', 'spugn', 'candeggina', 'sgrassatore', 'piatti di carta', 'bicchieri', 'pellicola', 'alluminio', 'lavastoviglie', 'pastiglie', 'lavatrice', 'scopa', 'strac', 'pile', 'batteri', 'lampadin', 'tovaglioli', 'spazzatura', 'anticalcare', 'brillantante', 'vetri', 'lucidante', 'insetticida', 'zampironi', 'cand', 'fiammiferi', 'accendino', 'carta forno'],
  igiene: ['shampoo', 'balsamo', 'sapone', 'bagnoschiuma', 'docciaschiuma', 'dentifricio', 'spazzolin', 'deodorante', 'assorbenti', 'cotton', 'dischetti', 'rasoi', 'lamette', 'crema', 'medicin', 'cerotti', 'salviette', 'carta igienica', 'fazzoletti', 'tachipirina', 'oki', 'moment', 'collutorio', 'struccante', 'filo interdentale', 'solare', 'protezione', 'pannolini', 'trucco', 'smalto', 'garze', 'disinfettante', 'termometro', 'vitamine', 'integrator'],
};

export function guessCategory(name) {
  const padded = ' ' + name.toLowerCase() + ' ';
  let best = 'altro';
  let bestLen = 0;
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      if (w.length > bestLen && padded.includes(' ' + w)) {
        best = cat;
        bestLen = w.length;
      }
    }
  }
  return best;
}

/** L'app ricorda la categoria scelta per ogni prodotto. */
function memoKey(name) {
  return name.toLowerCase().trim();
}
function rememberCategory(name, cat) {
  store.set('spesaMemo', memoKey(name), { name: name.trim(), cat });
}
function categoryFor(name) {
  return store.get('spesaMemo', memoKey(name))?.cat || guessCategory(name);
}

function editItem(item) {
  formDialog({
    title: 'Modifica prodotto',
    color: COLOR,
    autofocus: false,
    body: `
      <label class="field"><span>Prodotto</span><input name="name" required value="${esc(item.name)}"></label>
      <label class="field"><span>Quantità o note</span><input name="qty" placeholder="es. 2 confezioni, quello senza lattosio…" value="${esc(item.qty)}"></label>
      <label class="field"><span>Categoria</span>
        <select name="cat">${CATS.map((c) => `<option value="${c.id}" ${c.id === item.cat ? 'selected' : ''}>${c.emoji} ${c.name}</option>`).join('')}</select>
      </label>
      <label class="switch"><input type="checkbox" name="urgent" ${item.urgent ? 'checked' : ''}> Urgente (compare nella home)</label>`,
    onSubmit: (v) => {
      store.update('spesa', item.id, { name: v.name, qty: v.qty, cat: v.cat, urgent: !!v.urgent });
      rememberCategory(v.name, v.cat);
    },
    onDelete: () => {
      const removed = store.remove('spesa', item.id);
      toast(`"${item.name}" eliminato`, { label: 'Annulla', run: () => store.restore('spesa', removed) });
    },
  });
}

function row(item) {
  const sub = [item.qty ? esc(item.qty) : '', byWho(item.createdBy)].filter(Boolean).join(' · ');
  return `
    <div class="row ${item.done ? 'done' : ''}" data-id="${item.id}">
      <button class="check" type="button" data-act="toggle" aria-label="${item.done ? 'Togli la spunta' : 'Spunta'} ${esc(item.name)}"></button>
      <div class="row-main" data-act="edit">
        <div class="row-title">${esc(item.name)} ${item.urgent && !item.done ? '<span class="tag urgent">Urgente</span>' : ''}</div>
        <div class="row-sub">${sub}</div>
      </div>
    </div>`;
}

export default function spesa(root) {
  root.style.setProperty('--c', COLOR);
  root.innerHTML = `
    ${pageHead({ title: `<span class="badge-icon" style="--c:${COLOR}">${icon('cart')}</span>Spesa`, count: ' ' })}
    <form class="quick-add" data-add>
      <input name="name" list="spesa-sugg" placeholder="Cosa serve? es. latte, pane…" autocomplete="off" enterkeyhint="done" aria-label="Aggiungi prodotto">
      <button class="icon-btn" type="submit" aria-label="Aggiungi">${icon('plus')}</button>
    </form>
    <datalist id="spesa-sugg"></datalist>
    <div data-list></div>`;

  const form = root.querySelector('[data-add]');
  const input = form.elements.name;
  const listEl = root.querySelector('[data-list]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const same = store.getAll('spesa').find((i) => memoKey(i.name) === memoKey(name));
    if (same && !same.done) {
      toast(`"${same.name}" è già in lista`);
    } else if (same) {
      store.update('spesa', same.id, { done: false });
    } else {
      const cat = categoryFor(name);
      store.add('spesa', { name, cat, qty: '', urgent: false, done: false });
      rememberCategory(name, cat);
    }
    input.value = '';
    input.focus();
  });

  listEl.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    const rowEl = e.target.closest('[data-id]');
    if (!act || !rowEl) return;
    const item = store.get('spesa', rowEl.dataset.id);
    if (!item) return;
    if (act.dataset.act === 'toggle') store.update('spesa', item.id, { done: !item.done, doneAt: Date.now() });
    if (act.dataset.act === 'edit') editItem(item);
  });

  const draw = () => {
    const all = store.getAll('spesa');
    const todo = all.filter((i) => !i.done);
    const done = all.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    root.querySelector('[data-count]').textContent = todo.length ? todo.length : '';

    // Suggerimenti: prodotti usati in passato che non sono già in lista.
    const inList = new Set(todo.map((i) => memoKey(i.name)));
    root.querySelector('#spesa-sugg').innerHTML = store.getAll('spesaMemo')
      .filter((m) => !inList.has(m.id))
      .map((m) => `<option value="${esc(m.name)}">`).join('');

    if (!all.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="big">🛒</span>
          <p><strong>La lista della spesa è vuota</strong></p>
          <p>Scrivi qui sopra cosa serve: l'app lo mette da sola nella categoria giusta.</p>
        </div>`;
      return;
    }

    let html = '';
    for (const cat of CATS) {
      const items = todo.filter((i) => (i.cat || 'altro') === cat.id).sort((a, b) => (b.urgent - a.urgent) || a.name.localeCompare(b.name, 'it'));
      if (!items.length) continue;
      html += `
        <section class="group">
          <h3 class="group-head"><span>${cat.emoji} ${cat.name}</span></h3>
          <div class="card rows">${items.map(row).join('')}</div>
        </section>`;
    }
    if (!todo.length) {
      html += `<div class="empty-state"><span class="big">✅</span><p><strong>Hai preso tutto!</strong></p></div>`;
    }
    if (done.length) {
      html += `
        <section class="group">
          <h3 class="group-head"><span>Nel carrello · ${done.length}</span><button class="link-btn" type="button" data-clear>Svuota</button></h3>
          <div class="card rows">${done.map(row).join('')}</div>
        </section>`;
    }
    listEl.innerHTML = html;

    listEl.querySelector('[data-clear]')?.addEventListener('click', () => {
      const removed = store.remove('spesa', done.map((i) => i.id));
      toast(`${removed.length} prodotti tolti dal carrello`, { label: 'Annulla', run: () => store.restore('spesa', removed) });
    });
  };

  draw();
  return store.subscribe(draw);
}
