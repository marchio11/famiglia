import * as store from '../store.js';
import { esc, daysUntil, relDate, dueClass, avatar, memberColor, ymd } from '../util.js';
import * as gcal from '../gcal.js';
import * as scad from '../scadenze.js';
import * as trips from '../viaggi.js';
import { icon } from '../icons.js';
import { pickUser } from '../user.js';
import { assigneesOf } from './todo.js';

const SUMMARY_DAYS = 7; // quanti giorni in avanti guardare
// L'app si è trasferita su Firebase Hosting: chi usa ancora il vecchio
// indirizzo (GitHub Pages) vede un avviso con il collegamento a quello nuovo.
const NEW_URL = 'https://casa-marchionni.web.app/';
const MOVED = location.hostname.endsWith('github.io');

const SUMMARY_VISIBLE = 3; // voci visibili senza scorrere
const SCAD_DAYS = 30; // le scadenze dei documenti compaiono un mese prima

/** Raccoglie le scadenze da tutte le sezioni. */
function upcoming() {
  const items = [];
  const me = store.getUser();

  // Da fare (to-do): quelli in scadenza nei prossimi giorni, più quelli a priorità alta
  // (questi ultimi solo per le persone assegnate, o per tutti se è di tutti).
  for (const t of store.getAll('todo')) {
    if (t.done) continue;
    const list = assigneesOf(t);
    const forAll = !list.length || list.length === store.MEMBERS.length;
    const soon = !!t.due && daysUntil(t.due) <= SUMMARY_DAYS;
    const high = t.priority === 3 && (forAll || list.includes(me));
    if (!soon && !high) continue;
    const names = list.map((m) => (m === me ? 'tu' : m)).sort((a, b) => (a === 'tu' ? -1 : b === 'tu' ? 1 : 0));
    const who = forAll ? 'tutti' : names.join(' e ');
    items.push({
      date: t.due || '', // senza data: in cima, con l'etichetta "Priorità alta"
      title: t.title,
      sub: `${high && t.due ? '🚩 Alta · ' : ''}Da fare · ${who}`,
      href: '#/todo',
      color: high ? 'var(--danger)' : 'var(--c-todo)',
    });
  }

  for (const it of store.getAll('listItems')) {
    if (it.done || !it.due) continue;
    if (daysUntil(it.due) > SUMMARY_DAYS) continue;
    const list = store.get('lists', it.listId);
    if (!list) continue;
    items.push({ date: it.due, title: it.text, sub: `${list.emoji || ''} ${list.name}`, href: `#/liste/${list.id}`, color: 'var(--c-liste)' });
  }

  // Viaggi (solo per chi parte): conto alla rovescia nei 30 giorni prima,
  // durante il viaggio il programma di oggi.
  const todayKey = ymd(new Date());
  for (const t of trips.all()) {
    if (!trips.concerns(t, me) || trips.status(t) === 'concluso') continue;
    if (trips.status(t) === 'in corso') {
      const prog = trips.programItems(t.id, todayKey).filter((i) => !i.done);
      items.push({
        date: todayKey,
        title: `${t.emoji || '✈️'} Oggi: ${t.name}`,
        sub: prog.length ? prog.slice(0, 2).map((i) => `${i.time ? `${i.time} ` : ''}${i.text}`).join(' · ') + (prog.length > 2 ? '…' : '') : 'Buon viaggio! 🎒',
        href: `#/viaggi/${t.id}`,
        color: 'var(--c-viaggi)',
        tag: { cls: 'soon', text: trips.countdown(t).replace('In corso · ', '') },
        order: -1,
      });
    } else if (daysUntil(t.start) <= 30) {
      const prima = trips.listsOf(t.id).filter((l) => !l.program && l.type === 'cose');
      const todo = store.getAll('listItems').filter((i) => !i.done && prima.some((l) => l.id === i.listId)).length;
      items.push({
        date: t.start,
        title: `${t.emoji || '✈️'} ${t.name}: ${trips.countdown(t).toLowerCase()}`,
        sub: `Viaggio${todo ? ` · ${todo} ${todo === 1 ? 'cosa' : 'cose'} da fare prima` : ''}`,
        href: `#/viaggi/${t.id}`,
        color: 'var(--c-viaggi)',
      });
    }
  }

  // Scadenze dei documenti: compaiono già 30 giorni prima.
  for (const s of scad.all()) {
    if (daysUntil(s.date) > SCAD_DAYS) continue;
    items.push({
      date: s.date,
      title: `${scad.label(s)} · ${s.entityName}`,
      sub: '📄 Scadenza documenti',
      href: `#/documenti/${s.entityId}`,
      color: 'var(--c-doc)',
    });
  }

  // Eventi del calendario (Famiglia + personali di chi guarda), dall'ultima copia.
  // Quelli creati dalle scadenze non vengono ripetuti.
  const fromScad = new Set([...scad.eventIds(), ...trips.eventIds()]);
  for (const e of gcal.available() ? gcal.cached()?.events || [] : []) {
    if (gcal.isOver(e) || fromScad.has(e.id) || !gcal.concerns(e, me)) continue;
    const day = gcal.dayKey(e);
    if (daysUntil(day) > SUMMARY_DAYS) continue;
    const when = e.allDay ? 'tutto il giorno' : `ore ${gcal.timeOf(e.start)}`;
    const priv = e.cal === 'privato';
    items.push({
      date: day,
      title: e.title,
      sub: `${priv ? '🔒 Solo tu' : `Calendario${e.who?.length ? ` · ${e.who.map((m) => (m === me ? 'tu' : m)).join(' e ')}` : ''}`} · ${when}`,
      href: '#/calendario',
      color: priv ? memberColor(me) : 'var(--c-cal)',
      order: e.allDay ? 0 : gcal.startDate(e).getTime(),
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || (a.order || 0) - (b.order || 0));
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
    const open = store.getAll('todo').filter((t) => !t.done);
    const late = open.filter((t) => t.due && daysUntil(t.due) < 0).length;
    if (!open.length) return 'Tutto fatto! 🎉';
    return `${open.length} attività${late ? ` · ${late} in ritardo` : ''}`;
  }
  if (id === 'liste') {
    const n = store.getAll('lists').filter((l) => !l.tripId).length;
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
    ${MOVED ? `
    <a class="moved-banner" href="${NEW_URL}" target="_blank" rel="noopener">
      <span class="big">📦</span>
      <span><b>L'app ha un nuovo indirizzo!</b><br>Tocca qui per aprire la nuova versione e installala (menu ⋮ → Installa app). Ritroverai tutti i dati. Poi puoi disinstallare questa.</span>
    </a>` : ''}
    <section class="summary card" aria-labelledby="sum-title">
      <header class="sum-head">
        <span class="sum-badge">${icon('bell')}</span>
        <h2 id="sum-title">In evidenza</h2>
        <span class="sum-count" data-sum-count></span>
      </header>
      <div class="sum-wrap">
        <div class="sum-list" data-sum-list></div>
        <div class="sum-track" data-sum-track hidden><div class="sum-thumb"></div></div>
      </div>
    </section>
    <h2 class="section-label">Sezioni</h2>
    <nav class="tiles" data-tiles></nav>
    <p class="version" data-version></p>`;

  const $ = (s) => root.querySelector(s);

  /** Mostra al massimo SUMMARY_VISIBLE voci: le altre si vedono scorrendo. */
  function fitSummary(scrollTop = 0) {
    const list = $('[data-sum-list]');
    const track = $('[data-sum-track]');
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

  const draw = () => {
    const me = store.getUser();
    $('[data-hello]').textContent = me ? `${greeting()}, ${me}!` : `${greeting()}!`;
    $('[data-who]').innerHTML = me ? `${avatar(me)}${esc(me)}` : `${icon('user')}Chi sei?`;

    // Riquadro riepilogativo
    const items = upcoming();
    const urgent = store.getAll('spesa').filter((i) => !i.done && i.urgent);
    if (urgent.length) {
      // I prodotti urgenti vanno tra le cose di oggi.
      const names = urgent.slice(0, 3).map((i) => i.name).join(', ') + (urgent.length > 3 ? '…' : '');
      const today = ymd(new Date());
      const at = items.findIndex((it) => it.date > today);
      items.splice(at === -1 ? items.length : at, 0, {
        title: `${urgent.length === 1 ? '1 cosa urgente' : `${urgent.length} cose urgenti`} da comprare`,
        sub: names,
        href: '#/spesa',
        color: 'var(--c-spesa)',
        tag: { cls: 'urgent', text: 'Spesa' },
      });
    }

    const list = $('[data-sum-list]');
    const prevScroll = list.scrollTop;
    $('[data-sum-count]').textContent = items.length || '';
    list.innerHTML = items.length
      ? items.map((it) => {
        const tag = it.tag || (it.date
          ? { cls: dueClass(it.date), text: relDate(it.date) }
          : { cls: 'overdue', text: '🚩 Priorità alta' });
        return `
          <a class="sum-row" href="${it.href}" style="--c:${it.color}">
            <span class="dot"></span>
            <span class="txt">
              <div class="t">${esc(it.title)}</div>
              <div class="s"><span class="tag ${tag.cls}">${esc(tag.text)}</span><span>${esc(it.sub)}</span></div>
            </span>
          </a>`;
      }).join('')
      : `<p class="empty">Tutto tranquillo: nessuna scadenza nei prossimi ${SUMMARY_DAYS} giorni 🌿</p>`;
    fitSummary(prevScroll);

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
