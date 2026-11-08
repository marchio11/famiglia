import * as store from '../store.js';
import { esc, daysUntil, relDate, dueClass, avatar } from '../util.js';
import { icon } from '../icons.js';
import { pickUser } from '../user.js';

const SUMMARY_DAYS = 7; // quanti giorni in avanti guardare
const SUMMARY_MAX = 6;

/** Raccoglie le scadenze da tutte le sezioni. */
function upcoming() {
  const items = [];
  const me = store.getUser();

  for (const t of store.getAll('todo')) {
    if (t.done || !t.due) continue;
    if (daysUntil(t.due) > SUMMARY_DAYS) continue;
    const who = t.assignee ? (t.assignee === me ? 'tu' : t.assignee) : 'tutti';
    items.push({ date: t.due, title: t.title, sub: `To-do · ${who}`, href: '#/todo', color: 'var(--c-todo)' });
  }

  for (const it of store.getAll('listItems')) {
    if (it.done || !it.due) continue;
    if (daysUntil(it.due) > SUMMARY_DAYS) continue;
    const list = store.get('lists', it.listId);
    if (!list) continue;
    items.push({ date: it.due, title: it.text, sub: `${list.emoji || ''} ${list.name}`, href: `#/liste/${list.id}`, color: 'var(--c-liste)' });
  }

  // In Fase 3 qui arriveranno gli eventi del calendario Famiglia,
  // in Fase 4 le scadenze dei documenti.

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

const TILES = [
  { id: 'spesa', name: 'Spesa', icon: 'cart', color: 'var(--c-spesa)' },
  { id: 'todo', name: 'To-do', icon: 'todo', color: 'var(--c-todo)' },
  { id: 'liste', name: 'Liste', icon: 'list', color: 'var(--c-liste)' },
  { id: 'calendario', name: 'Calendario', icon: 'calendar', color: 'var(--c-cal)' },
  { id: 'documenti', name: 'Documenti', icon: 'folder', color: 'var(--c-doc)', wide: true },
];

function tileInfo(id) {
  if (id === 'spesa') {
    const n = store.getAll('spesa').filter((i) => !i.done).length;
    return n ? `${n} da comprare` : 'Lista vuota';
  }
  if (id === 'todo') {
    const open = store.getAll('todo').filter((t) => !t.done);
    const late = open.filter((t) => t.due && daysUntil(t.due) < 0).length;
    if (!open.length) return 'Tutto fatto! 🎉';
    return `${open.length} da fare${late ? ` · ${late} in ritardo` : ''}`;
  }
  if (id === 'liste') {
    const n = store.getAll('lists').length;
    return n === 1 ? '1 lista' : `${n} liste`;
  }
  if (id === 'calendario') return 'In arrivo';
  if (id === 'documenti') return 'In arrivo · personali, veicoli, immobili';
  return '';
}

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
    <section class="summary card" data-summary aria-label="In evidenza"></section>
    <h2 class="section-label">Sezioni</h2>
    <nav class="tiles" data-tiles></nav>`;

  const $ = (s) => root.querySelector(s);
  $('[data-who]').onclick = () => pickUser();

  const draw = () => {
    const me = store.getUser();
    $('[data-hello]').textContent = me ? `${greeting()}, ${me}!` : `${greeting()}!`;
    $('[data-who]').innerHTML = me ? `${avatar(me)}${esc(me)}` : `${icon('user')}Chi sei?`;

    // Riquadro riepilogativo
    const items = upcoming();
    const urgent = store.getAll('spesa').filter((i) => !i.done && i.urgent);
    let html = `<h2>${icon('bell', 'sm')} In evidenza</h2>`;
    if (!items.length && !urgent.length) {
      html += `<p class="empty">Tutto tranquillo: nessuna scadenza nei prossimi ${SUMMARY_DAYS} giorni 🌿</p>`;
    }
    for (const it of items.slice(0, SUMMARY_MAX)) {
      html += `
        <a class="sum-row" href="${it.href}" style="--c:${it.color}">
          <span class="dot"></span>
          <span class="txt"><div class="t">${esc(it.title)}</div><div class="s">${esc(it.sub)}</div></span>
          <span class="tag ${dueClass(it.date)}">${esc(relDate(it.date))}</span>
        </a>`;
    }
    if (urgent.length) {
      const names = urgent.slice(0, 3).map((i) => i.name).join(', ') + (urgent.length > 3 ? '…' : '');
      html += `
        <a class="sum-row" href="#/spesa" style="--c:var(--c-spesa)">
          <span class="dot"></span>
          <span class="txt"><div class="t">${urgent.length === 1 ? '1 cosa urgente' : `${urgent.length} cose urgenti`} da comprare</div><div class="s">${esc(names)}</div></span>
          <span class="tag urgent">Spesa</span>
        </a>`;
    }
    if (items.length > SUMMARY_MAX) html += `<div class="sum-more">e altre ${items.length - SUMMARY_MAX} scadenze…</div>`;
    $('[data-summary]').innerHTML = html;

    // Riquadri delle sezioni
    $('[data-tiles]').innerHTML = TILES.map((t) => `
      <a class="tile ${t.wide ? 'wide' : ''} ${['calendario', 'documenti'].includes(t.id) ? 'soon' : ''}" href="#/${t.id}" style="--c:${t.color}">
        <span class="badge-icon">${icon(t.icon)}</span>
        <span><div class="name">${t.name}</div><div class="info">${esc(tileInfo(t.id))}</div></span>
      </a>`).join('');
  };

  draw();
  return store.subscribe(draw);
}
