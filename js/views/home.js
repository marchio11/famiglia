import * as store from '../store.js';
import { esc, daysUntil, relDate, dueClass, avatar, memberColor, ymd } from '../util.js';
import * as gcal from '../gcal.js';
import * as scad from '../scadenze.js';
import * as trips from '../viaggi.js';
import { icon } from '../icons.js';
import { pickUser } from '../user.js';
import { assigneesOf, started as startedTodo, concerns as concernsTodo } from './todo.js';
import * as novita from '../novita.js';

const EVENT_DAYS = 7; // eventi del calendario: quanti giorni in avanti
const SUMMARY_VISIBLE = 3; // voci visibili senza scorrere

/**
 * "In evidenza": i "Da fare" di chi guarda (assegnati a lui/lei o a tutti),
 * già iniziati, e i prodotti urgenti della spesa.
 */
function highlights() {
  const me = store.getUser();
  const items = [];
  for (const t of store.getAll('todo')) {
    if (t.done || !startedTodo(t) || !concernsTodo(t, me)) continue;
    const list = assigneesOf(t);
    const forAll = !list.length || list.length === store.MEMBERS.length;
    const names = list.map((m) => (m === me ? 'tu' : m)).sort((a, b) => (a === 'tu' ? -1 : b === 'tu' ? 1 : 0));
    const high = t.priority === 3;
    items.push({
      date: t.due || '',
      prio: t.priority || 2,
      title: t.title,
      sub: `${high && t.due ? '🚩 Alta · ' : ''}Da fare · ${forAll ? 'tutti' : names.join(' e ')}`,
      href: '#/todo',
      color: high ? 'var(--danger)' : 'var(--c-todo)',
      tag: t.due ? null : high ? { cls: 'overdue', text: '🚩 Priorità alta' } : { cls: '', text: 'Senza scadenza' },
    });
  }
  // Prima quelle con scadenza (la più vicina in cima), poi le altre per priorità.
  items.sort((a, b) => (!a.date - !b.date) || a.date.localeCompare(b.date) || b.prio - a.prio);

  const urgent = store.getAll('spesa').filter((i) => !i.done && i.urgent);
  if (urgent.length) {
    // I prodotti urgenti vanno tra le cose di oggi.
    const names = urgent.slice(0, 3).map((i) => i.name).join(', ') + (urgent.length > 3 ? '…' : '');
    const today = ymd(new Date());
    const at = items.findIndex((it) => !it.date || it.date > today);
    items.splice(at === -1 ? items.length : at, 0, {
      title: `${urgent.length === 1 ? '1 cosa urgente' : `${urgent.length} cose urgenti`} da comprare`,
      sub: names,
      href: '#/spesa',
      color: 'var(--c-spesa)',
      tag: { cls: 'urgent', text: 'Spesa' },
    });
  }
  return items;
}

/**
 * "Eventi": calendario dei prossimi 7 giorni, solo quelli di chi guarda
 * (dove è coinvolto, quelli di famiglia senza persone indicate e i suoi privati).
 */
function events() {
  const me = store.getUser();
  const items = [];
  for (const e of gcal.cached()?.events || []) {
    if (gcal.isOver(e) || !gcal.concerns(e, me)) continue;
    const day = gcal.dayKey(e);
    if (daysUntil(day) > EVENT_DAYS) continue;
    const when = e.allDay ? 'tutto il giorno' : `ore ${gcal.timeOf(e.start)}`;
    const priv = e.cal === 'privato';
    const who = e.who?.length && e.who.length < store.MEMBERS.length
      ? e.who.map((m) => (m === me ? 'tu' : m)).join(' e ')
      : 'Famiglia';
    items.push({
      date: day,
      title: e.title,
      sub: `${priv ? '🔒 Solo tu' : who} · ${when}`,
      href: '#/calendario',
      color: priv ? memberColor(me) : 'var(--c-cal)',
      order: e.allDay ? 0 : gcal.startDate(e).getTime(),
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  return items;
}

const TILES = [
  { id: 'spesa', name: 'Spesa', icon: 'cart', color: 'var(--c-spesa)' },
  { id: 'todo', name: 'Da fare', icon: 'todo', color: 'var(--c-todo)' },
  { id: 'liste', name: 'Liste', icon: 'list', color: 'var(--c-liste)' },
  { id: 'calendario', name: 'Calendario', icon: 'calendar', color: 'var(--c-cal)' },
  { id: 'viaggi', name: 'Viaggi', icon: 'plane', color: 'var(--c-viaggi)' },
  { id: 'documenti', name: 'Documenti', icon: 'folder', color: 'var(--c-doc)' },
];

function tileInfo(id) {
  if (id === 'spesa') {
    const n = store.getAll('spesa').filter((i) => !i.done).length;
    return n ? `${n} da comprare` : 'Lista vuota';
  }
  if (id === 'todo') {
    const open = store.getAll('todo').filter((t) => !t.done && startedTodo(t));
    const late = open.filter((t) => t.due && daysUntil(t.due) < 0).length;
    if (!open.length) return 'Tutto fatto! 🎉';
    return `${open.length} attività${late ? ` · ${late} in ritardo` : ''}`;
  }
  if (id === 'liste') {
    const n = store.getAll('lists').filter((l) => !l.tripId).length + store.getAll('privLists').length;
    if (!n) return 'Nessuna lista';
    return n === 1 ? '1 lista' : `${n} liste`;
  }
  if (id === 'calendario') {
    if (!gcal.available()) return 'Serve l\'accesso con Google';
    const data = gcal.cached();
    if (!data) return 'Tocca per collegarlo';
    const next = data.events.find((e) => !gcal.isOver(e));
    return next ? `Prossimo: ${next.title} · ${relDate(gcal.dayKey(next)).toLowerCase()}` : 'Nessun impegno in vista';
  }
  if (id === 'viaggi') {
    const next = trips.all().find((t) => trips.status(t) !== 'concluso');
    if (!next) return 'Nessun viaggio in programma';
    return trips.status(next) === 'in corso' ? `In viaggio: ${next.name} 🎒` : `${next.name} · ${trips.countdown(next).toLowerCase()}`;
  }
  if (id === 'documenti') {
    const next = scad.all().find((s) => daysUntil(s.date) >= -30);
    return next ? `Prossima scadenza: ${scad.label(next)} · ${next.entityName} · ${relDate(next.date).toLowerCase()}` : 'Persone, veicoli, immobili, animali';
  }
  return '';
}

/** Riquadro della home con titolo, icona, contatore ed elenco scorrevole. */
const box = (id, title, iconName, cls = '') => `
    <section class="summary card ${cls}" aria-labelledby="${id}-title">
      <header class="sum-head">
        <span class="sum-badge">${icon(iconName)}</span>
        <h2 id="${id}-title">${title}</h2>
        <span class="sum-count" data-${id}-count></span>
      </header>
      <div class="sum-wrap">
        <div class="sum-list" data-${id}-list></div>
        <div class="sum-track" data-${id}-track hidden><div class="sum-thumb"></div></div>
      </div>
    </section>`;

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Buonanotte';
  if (h < 13) return 'Buongiorno';
  if (h < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

export default function home(root) {
  root.innerHTML = `
    <header class="home-head">
      <div>
        <p class="hello" data-hello></p>
        <p class="today">${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      <button class="who" type="button" data-who aria-label="Cambia utente"></button>
    </header>
    ${box('sum', 'In evidenza', 'bell')}
    ${gcal.available() ? box('ev', 'Eventi', 'calendar', 'events') : ''}
    <h2 class="section-label">Sezioni</h2>
    <nav class="tiles" data-tiles></nav>
    <p class="version"><span data-version></span> · <button class="link-btn news-link" type="button" data-news>✨ Novità</button></p>`;

  const $ = (s) => root.querySelector(s);
  $('[data-news]').onclick = () => novita.show();

  /** Mostra al massimo SUMMARY_VISIBLE voci: le altre si vedono scorrendo. */
  function fitSummary(id, scrollTop = 0) {
    const list = $(`[data-${id}-list]`);
    const track = $(`[data-${id}-track]`);
    const thumb = track.firstElementChild;
    const rows = list.querySelectorAll('.sum-row');
    const extra = rows.length - SUMMARY_VISIBLE;
    if (extra <= 0) {
      list.style.maxHeight = '';
      list.classList.remove('scrolls', 'more');
      track.hidden = true;
      return;
    }
    const last = rows[SUMMARY_VISIBLE - 1];
    list.style.maxHeight = `${last.offsetTop + last.offsetHeight}px`;
    list.classList.add('scrolls');
    list.scrollTop = scrollTop;
    track.hidden = false;
    // Barra di scorrimento sempre visibile (quelle di Android si nascondono).
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = list;
      const h = Math.max(24, (clientHeight / scrollHeight) * track.clientHeight);
      const max = scrollHeight - clientHeight;
      thumb.style.height = `${h}px`;
      thumb.style.transform = `translateY(${max > 0 ? (scrollTop / max) * (track.clientHeight - h) : 0}px)`;
      list.classList.toggle('more', scrollTop < max - 4);
    };
    list.onscroll = update;
    update();
  }

  // Numero di versione (dal nome della cache del service worker).
  if ('caches' in window) {
    caches.keys().then((keys) => {
      const v = keys.map((k) => k.match(/^casa-v(\d+)$/)?.[1]).filter(Boolean).sort((a, b) => b - a)[0];
      if (v) $('[data-version]').textContent = `Casa Marchionni · versione ${v}`;
    }).catch(() => {});
  }
  $('[data-who]').onclick = () => pickUser();

  /** Riempie un riquadro (In evidenza / Eventi) con le sue voci. */
  function fill(id, items, emptyHtml) {
    const list = $(`[data-${id}-list]`);
    const prevScroll = list.scrollTop;
    $(`[data-${id}-count]`).textContent = items.length || '';
    list.innerHTML = items.length
      ? items.map((it) => {
        const tag = it.tag !== undefined && it.tag !== null ? it.tag : { cls: dueClass(it.date), text: relDate(it.date) };
        return `
          <a class="sum-row" href="${it.href}" style="--c:${it.color}">
            <span class="dot"></span>
            <span class="txt">
              <div class="t">${esc(it.title)}</div>
              <div class="s"><span class="tag ${tag.cls}">${esc(tag.text)}</span><span>${esc(it.sub)}</span></div>
            </span>
          </a>`;
      }).join('')
      : `<p class="empty">${emptyHtml}</p>`;
    fitSummary(id, prevScroll);
  }

  const draw = () => {
    const me = store.getUser();
    $('[data-hello]').textContent = me ? `${greeting()}, ${me}!` : `${greeting()}!`;
    $('[data-who]').innerHTML = me ? `${avatar(me)}${esc(me)}` : `${icon('user')}Chi sei?`;

    fill('sum', highlights(), 'Tutto tranquillo: niente da fare per te 🌿');
    if (gcal.available()) {
      fill('ev', events(), gcal.cached()
        ? `Nessun evento nei prossimi ${EVENT_DAYS} giorni 🌿`
        : '<a href="#/calendario">Apri il Calendario</a> per vedere qui i prossimi eventi');
    }

    // Riquadri delle sezioni
    $('[data-tiles]').innerHTML = TILES.map((t) => `
      <a class="tile ${t.wide ? 'wide' : ''} " href="#/${t.id}" style="--c:${t.color}">
        <span class="badge-icon">${icon(t.icon)}</span>
        <span><div class="name">${t.name}</div><div class="info">${esc(tileInfo(t.id))}</div></span>
      </a>`).join('');
  };

  draw();
  const offStore = store.subscribe(draw);
  const offCal = gcal.onChange(draw);
  // Se il permesso del calendario è ancora valido, aggiorna gli eventi in silenzio.
  if (gcal.available() && gcal.connected()) gcal.fetchEvents().catch(() => {});
  return () => {
    offStore();
    offCal();
  };
}
