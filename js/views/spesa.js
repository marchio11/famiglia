import * as store from '../store.js';
import { esc, byWho, toast, formDialog, pageHead, categorySelect, categoriesDialog, splitEmoji } from '../util.js';
import { icon } from '../icons.js';
import * as google from '../google.js';
import * as drive from '../drive.js';
import * as photos from '../photos.js';

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

/* ---------- Categorie (predefinite + personalizzate) ---------- */

// Le categorie iniziali si possono rinominare o eliminare: le modifiche sono
// salvate in "spesaCats" con lo stesso id della categoria iniziale
// ({ name, emoji, hidden }). Quelle create dall'utente hanno un id nuovo.
const isBuiltin = (id) => CATS.some((c) => c.id === id);

/** Categorie iniziali con le modifiche applicate (comprese quelle eliminate). */
function builtinCats() {
  return CATS.map((c) => {
    const o = store.get('spesaCats', c.id);
    return { ...c, name: o?.name || c.name, emoji: o?.emoji || c.emoji, hidden: !!o?.hidden && c.id !== 'altro', builtin: true };
  });
}

/** Tutte le categorie in ordine: iniziali, personalizzate, poi "Altro". */
export function allCats() {
  const builtin = builtinCats();
  const custom = store.getAll('spesaCats')
    .filter((c) => !isBuiltin(c.id))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji || '🏷️', custom: true }));
  const base = [...builtin.filter((c) => c.id !== 'altro' && !c.hidden), ...custom, builtin.find((c) => c.id === 'altro')];
  // Ordine scelto dalla famiglia (config/spesaOrder); le categorie non ancora
  // ordinate mantengono la posizione di partenza, dopo quelle ordinate.
  const order = store.get('config', 'spesaOrder')?.order || [];
  if (!order.length) return base;
  const key = (c, i) => {
    const pos = order.indexOf(c.id);
    return pos === -1 ? order.length + i : pos;
  };
  return base.map((c, i) => ({ c, k: key(c, i) })).sort((a, b) => a.k - b.k).map((x) => x.c);
}

/** Salva l'ordine delle categorie. */
function saveOrder(ids) {
  store.set('config', 'spesaOrder', { order: ids });
}

const catExists = (id) => allCats().some((c) => c.id === id);
const catLabel = (c) => `${c.emoji} ${c.name}`;

/** Crea una categoria (o riusa quella con lo stesso nome, anche se era stata eliminata). */
function createCat(text) {
  const { emoji, name } = splitEmoji(text);
  const same = allCats().find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (same) return same.id;
  const hidden = builtinCats().find((c) => c.hidden && c.name.toLowerCase() === name.toLowerCase());
  if (hidden) {
    store.set('spesaCats', hidden.id, { ...store.get('spesaCats', hidden.id), hidden: false, ...(emoji ? { emoji } : {}) });
    return hidden.id;
  }
  const id = store.add('spesaCats', { name, emoji: emoji || '🏷️' });
  // Se c'è un ordine personalizzato, la nuova categoria va prima di "Altro".
  const order = store.get('config', 'spesaOrder')?.order;
  if (order?.length) {
    const at = order.indexOf('altro');
    saveOrder(at === -1 ? [...order, id] : [...order.slice(0, at), id, ...order.slice(at)]);
  }
  return id;
}

function manageCats() {
  const dlg = categoriesDialog({
    title: 'Categorie della spesa',
    color: COLOR,
    cats: allCats().map((c) => ({ id: c.id, label: catLabel(c), locked: c.id === 'altro' })),
    placeholder: 'es. 🐶 Animali',
    reorder: true,
    hint: 'Tieni premuto ⠿ e trascina per cambiare l\'ordine delle categorie nella lista (vale per tutta la famiglia). Tocca un nome per cambiarlo, anche l\'emoji iniziale. I prodotti di una categoria eliminata finiscono in "Altro", che non si può eliminare.',
    onSave: ({ renamed, deleted, added, order }) => {
      if (order) saveOrder(order);
      for (const r of renamed) {
        const { emoji, name } = splitEmoji(r.label);
        if (!name) continue;
        if (isBuiltin(r.id)) store.set('spesaCats', r.id, { ...store.get('spesaCats', r.id), name, emoji: emoji || CATS.find((c) => c.id === r.id).emoji, hidden: false });
        else store.update('spesaCats', r.id, { name, emoji: emoji || '🏷️' });
      }
      for (const id of deleted) {
        if (id === 'altro') continue;
        store.getAll('spesa').filter((i) => i.cat === id).forEach((i) => store.update('spesa', i.id, { cat: 'altro' }));
        if (isBuiltin(id)) store.set('spesaCats', id, { ...store.get('spesaCats', id), hidden: true });
        else store.remove('spesaCats', id);
      }
      added.forEach(createCat);
      if (renamed.length || deleted.length || added.length || order) toast('Categorie aggiornate');
    },
  });

  // Ripristino delle categorie iniziali (nomi, emoji e quelle eliminate).
  const changed = store.getAll('spesaCats').filter((c) => isBuiltin(c.id));
  const ordered = !!store.get('config', 'spesaOrder')?.order?.length;
  if (changed.length || ordered) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-btn restore-cats';
    btn.textContent = '↺ Ripristina le categorie iniziali';
    btn.onclick = () => {
      store.remove('spesaCats', changed.map((c) => c.id));
      if (ordered) store.remove('config', 'spesaOrder');
      dlg.close();
      toast('Categorie iniziali ripristinate');
    };
    dlg.querySelector('.actions').before(btn);
  }
}

/* ---------- Memoria dei prodotti ---------- */

/** L'app ricorda la categoria scelta per ogni prodotto. */
function memoKey(name) {
  // Diventa l'id del documento: niente "/" (non ammesso da Firestore).
  return name.toLowerCase().trim().replace(/\//g, '∕');
}
function rememberCategory(name, cat) {
  store.set('spesaMemo', memoKey(name), { name: name.trim(), cat });
}
function categoryFor(name) {
  const saved = store.get('spesaMemo', memoKey(name))?.cat;
  if (saved && catExists(saved)) return saved;
  const guess = guessCategory(name);
  return catExists(guess) ? guess : 'altro'; // la categoria indovinata potrebbe essere stata eliminata
}

/* ---------- Aggiunta e modifica ---------- */

/** Aggiunge un prodotto (o riattiva quello già presente). Restituisce l'id. */
function addProduct({ name, qty = '', cat, urgent = false }, { detailed = false } = {}) {
  const same = store.getAll('spesa').find((i) => memoKey(i.name) === memoKey(name));
  if (same && !same.done && !detailed) {
    toast(`"${same.name}" è già in lista`);
    return same.id;
  }
  if (same) {
    store.update('spesa', same.id, detailed ? { name, qty, cat, urgent, done: false } : { done: false });
    rememberCategory(name, detailed ? cat : same.cat);
    return same.id;
  }
  const id = store.add('spesa', { name, qty, cat, urgent, done: false });
  rememberCategory(name, cat);
  return id;
}

/* ---------- Foto dei prodotti ---------- */

/** Elimina prodotti (con le loro foto, dopo il tempo per "Annulla"). */
function removeProducts(ids, message) {
  const removed = store.remove('spesa', ids);
  removed.forEach(photos.scheduleDelete);
  toast(message(removed), {
    label: 'Annulla',
    run: () => {
      store.restore('spesa', removed);
      removed.forEach(photos.cancelDelete);
    },
  });
}

/** Carica la foto scelta e la collega al prodotto (sostituisce quella vecchia). */
async function attachPhoto(id, file) {
  const item = store.get('spesa', id);
  if (!item) return;
  try {
    if (!google.connected()) await google.connect();
    if (!drive.config()) {
      toast('Per le foto serve prima preparare le cartelle nella sezione Documenti');
      return;
    }
    toast('Carico la foto… 📷');
    const fields = await photos.upload(file, item.name);
    const old = store.get('spesa', id);
    if (!old) { // eliminato nel frattempo
      photos.scheduleDelete(fields);
      return;
    }
    if (old.photoId) photos.scheduleDelete(old);
    store.update('spesa', id, fields);
    toast('Foto salvata ✓');
  } catch (err) {
    const msg = google.explain(err);
    if (msg) toast(`Foto non salvata: ${msg}`);
  }
}

function photoField(it) {
  return `
    <div class="field">
      <span>Foto (facoltativa)</span>
      <div class="photo-pick">
        <span class="photo-preview" data-photo-preview>${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : '📷'}</span>
        <span class="photo-btns">
          <label class="btn ghost photo-btn">📷 Scatta<input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>
          <label class="btn ghost photo-btn">🖼️ Galleria<input type="file" accept="image/*" data-photo-input hidden></label>
        </span>
        ${it.photoId ? '<button type="button" class="link-btn photo-remove" data-photo-remove>Togli</button>' : ''}
      </div>
      <p class="hint">Così chi va a fare la spesa sa esattamente cosa prendere. La foto finisce su Google Drive, nella cartella "Lista della spesa", e viene eliminata insieme al prodotto.</p>
    </div>`;
}

/** Finestra completa: nuovo prodotto (item = null) o modifica. */
function itemForm(item, prefill = '') {
  const isNew = !item;
  const it = item || { name: prefill, qty: '', cat: prefill ? categoryFor(prefill) : 'altro', urgent: false };
  const cat = catExists(it.cat) ? it.cat : 'altro';
  const dlg = formDialog({
    title: isNew ? 'Aggiungi alla spesa' : 'Modifica prodotto',
    color: COLOR,
    autofocus: isNew,
    submitLabel: isNew ? 'Aggiungi' : 'Salva',
    body: `
      <label class="field"><span>Prodotto</span><input name="name" required value="${esc(it.name)}" placeholder="es. Latte" autocomplete="off"></label>
      <label class="field"><span>Quantità o note</span><input name="qty" placeholder="es. 2 confezioni, quello senza lattosio…" value="${esc(it.qty)}"></label>
      ${categorySelect({ name: 'cat', options: allCats().map((c) => ({ value: c.id, label: catLabel(c) })), selected: cat, placeholder: 'es. 🐶 Animali' })}
      <label class="switch"><input type="checkbox" name="urgent" ${it.urgent ? 'checked' : ''}> Urgente (compare nella home)</label>
      ${google.available() ? photoField(it) : ''}`,
    onSubmit: (v) => {
      const catId = v.cat === '__new__' ? createCat(v.catNew) : v.cat;
      const data = { name: v.name.replace(/\s+/g, ' '), qty: v.qty, cat: catId, urgent: !!v.urgent };
      let id = item?.id;
      if (isNew) {
        id = addProduct(data, { detailed: true });
      } else {
        store.update('spesa', item.id, data);
        rememberCategory(data.name, catId);
      }
      if (removePhoto && !picked && item?.photoId) {
        photos.scheduleDelete(item);
        store.update('spesa', item.id, { photoId: '', photoLink: '', photoFolder: '', thumb: '' });
      }
      // La foto si carica dopo (il permesso Google, se serve, si chiede qui: è un tocco).
      if (picked && id) attachPhoto(id, picked);
    },
    onDelete: isNew ? null : () => removeProducts([item.id], () => `"${item.name}" eliminato`),
  });

  // Foto: anteprima della foto scelta, o "Togli".
  let picked = null;
  let removePhoto = false;
  const form0 = dlg.querySelector('form');
  // "Scatta" apre direttamente la fotocamera, "Galleria" le foto del telefono.
  form0.querySelectorAll('[data-photo-input]').forEach((input) => input.addEventListener('change', (e) => {
    picked = e.target.files[0] || null;
    e.target.value = '';
    if (!picked) return;
    removePhoto = false;
    const url = URL.createObjectURL(picked);
    form0.querySelector('[data-photo-preview]').innerHTML = `<img src="${url}" alt="">`;
  }));
  form0.querySelector('[data-photo-remove]')?.addEventListener('click', (e) => {
    picked = null;
    removePhoto = true;
    form0.querySelector('[data-photo-preview]').textContent = '📷';
    e.currentTarget.remove();
  });

  // Nuovo prodotto: la categoria si aggiorna mentre scrivi, finché non la scegli a mano.
  if (isNew) {
    const form = dlg.querySelector('form');
    const sel = form.elements.cat;
    let touched = false;
    sel.addEventListener('change', () => { touched = true; });
    form.elements.name.addEventListener('input', (e) => {
      const name = e.target.value.trim();
      if (!touched && name) sel.value = categoryFor(name);
    });
  }
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
      ${item.thumb ? `<button class="thumb" type="button" data-act="photo" aria-label="Vedi la foto di ${esc(item.name)}"><img src="${esc(item.thumb)}" alt=""></button>` : ''}
    </div>`;
}

export default function spesa(root) {
  root.style.setProperty('--c', COLOR);
  root.innerHTML = `
    ${pageHead({
      badge: icon('cart'),
      title: 'Spesa',
      count: ' ',
      actions: `<button class="icon-btn" type="button" data-cats aria-label="Gestisci categorie">${icon('tag')}</button>`,
    })}
    <form class="quick-add" data-add>
      <input name="name" list="spesa-sugg" placeholder="Cosa serve? es. latte, pane…" autocomplete="off" enterkeyhint="done" aria-label="Aggiungi prodotto">
      <button class="icon-btn secondary" type="button" data-detailed aria-label="Aggiungi con dettagli (categoria, urgente…)">${icon('sliders')}</button>
      <button class="icon-btn" type="submit" aria-label="Aggiungi veloce">${icon('plus')}</button>
    </form>
    <datalist id="spesa-sugg"></datalist>
    <div class="cat-groups" data-list></div>`;

  const form = root.querySelector('[data-add]');
  const input = form.elements.name;
  const listEl = root.querySelector('[data-list]');

  root.querySelector('[data-cats]').onclick = manageCats;
  root.querySelector('[data-detailed]').onclick = () => {
    const prefill = input.value.trim();
    input.value = '';
    itemForm(null, prefill);
  };

  // Aggiunta veloce: categoria automatica, con possibilità di correggerla subito.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const exists = store.getAll('spesa').some((i) => !i.done && memoKey(i.name) === memoKey(name));
    const id = addProduct({ name, cat: categoryFor(name) });
    if (!exists) {
      const item = store.get('spesa', id);
      const c = allCats().find((x) => x.id === item.cat) || CATS.at(-1);
      toast(`${item.name} → ${catLabel(c)}`, { label: 'Modifica', run: () => itemForm(store.get('spesa', id)) });
    }
    input.value = '';
    input.focus();
  });

  listEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) {
      const done = store.getAll('spesa').filter((i) => i.done);
      removeProducts(done.map((i) => i.id), (r) => `${r.length} prodotti tolti dal carrello`);
      return;
    }
    const act = e.target.closest('[data-act]');
    const rowEl = e.target.closest('[data-id]');
    if (!act || !rowEl) return;
    const item = store.get('spesa', rowEl.dataset.id);
    if (!item) return;
    if (act.dataset.act === 'toggle') store.update('spesa', item.id, { done: !item.done, doneAt: Date.now() });
    if (act.dataset.act === 'edit') itemForm(item);
    if (act.dataset.act === 'photo' && item.photoLink) window.open(item.photoLink, '_blank', 'noopener');
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
          <p>Scrivi qui sopra cosa serve e premi <strong>+</strong>: l'app lo mette da sola nella categoria giusta.</p>
          <p>Con ${icon('sliders', 'sm')} scegli tu categoria, quantità e urgenza.</p>
        </div>`;
      return;
    }

    const cats = allCats();
    const known = new Set(cats.map((c) => c.id));
    let html = '';
    for (const cat of cats) {
      const items = todo
        .filter((i) => (known.has(i.cat) ? i.cat : 'altro') === cat.id)
        .sort((a, b) => (b.urgent - a.urgent) || a.name.localeCompare(b.name, 'it'));
      if (!items.length) continue;
      html += `
        <section class="group">
          <h3 class="group-head"><span>${esc(catLabel(cat))}</span></h3>
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
  };

  draw();
  return store.subscribe(draw);
}
