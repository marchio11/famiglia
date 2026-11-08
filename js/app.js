import * as store from './store.js';
import { pickUser, setAccount, knownName } from './user.js';
import { esc, toast } from './util.js';
import * as gcal from './gcal.js';
import home from './views/home.js';
import spesa from './views/spesa.js';
import todo from './views/todo.js';
import liste from './views/liste.js';
import calendario from './views/calendario.js';
import documenti from './views/documenti.js';

const routes = { '': home, spesa, todo, liste, calendario, documenti };
const root = document.getElementById('app');
let cleanup = null;
let routing = false;

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = routes[parts[0]] || home;
  if (cleanup) cleanup();
  cleanup = null;
  root.innerHTML = '';
  window.scrollTo(0, 0);
  cleanup = view(root, parts.slice(1)) || null;
}

function startRouting() {
  if (!routing) window.addEventListener('hashchange', route);
  routing = true;
  route();
}

function stopRouting() {
  if (cleanup) cleanup();
  cleanup = null;
  if (routing) window.removeEventListener('hashchange', route);
  routing = false;
}

/* ---------- Schermate di accesso (solo modalità cloud) ---------- */

function screen(html) {
  stopRouting();
  root.innerHTML = `<section class="gate">${html}</section>`;
}

function showLoading() {
  screen(`<img src="icons/icon.svg" alt="" class="gate-logo"><p class="hint">Caricamento…</p>`);
}

function showLogin(cloud, error = '') {
  screen(`
    <img src="icons/icon.svg" alt="" class="gate-logo">
    <h1>Casa Marchionni</h1>
    <p>Spesa, to-do, liste, calendario e documenti di famiglia.</p>
    <button class="btn primary google-btn" type="button" data-login>
      <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Entra con Google
    </button>
    ${error ? `<p class="gate-error">${esc(error)}</p>` : ''}
    <p class="hint">Usa il tuo account Google personale.</p>`);
  root.querySelector('[data-login]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      await cloud.login();
    } catch (err) {
      const msg = err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request'
        ? ''
        : `Accesso non riuscito (${err.code || err.message}). Riprova.`;
      showLogin(cloud, msg);
    }
  };
}

function showDenied(cloud, email) {
  screen(`
    <div class="big">🔒</div>
    <h1>Accesso non autorizzato</h1>
    <p>L'account <strong>${esc(email)}</strong> non fa parte di Casa Marchionni.</p>
    <p class="hint">Se è un errore, chiedi ad Andrea di aggiungere questo indirizzo nelle regole di Firebase.</p>
    <button class="btn primary" type="button" data-logout>Entra con un altro account</button>`);
  root.querySelector('[data-logout]').onclick = () => cloud.logout();
}

/* ---------- Avvio ---------- */

async function bootCloud() {
  showLoading();
  let cloud;
  let denied = false;
  let currentEmail = '';
  try {
    cloud = await store.loadCloud((err) => {
      console.error(err);
      if (err?.code === 'permission-denied') {
        if (!denied) {
          denied = true;
          store.disconnect();
          showDenied(cloud, currentEmail);
        }
      } else {
        toast('Problema di sincronizzazione: riprova più tardi');
      }
    });
  } catch (e) {
    console.error(e);
    screen(`<div class="big">📡</div><h1>Nessuna connessione</h1><p>Il primo avvio richiede internet. Controlla la connessione e riprova.</p>
      <button class="btn primary" type="button" onclick="location.reload()">Riprova</button>`);
    return;
  }

  cloud.watchAuth(async (user) => {
    denied = false;
    if (!user) {
      setAccount(null);
      store.disconnect();
      showLogin(cloud);
      return;
    }
    currentEmail = user.email;
    setAccount({
      uid: user.uid,
      email: user.email,
      logout: () => {
        gcal.forget();
        cloud.logout();
      },
    });
    store.connect();
    const name = knownName(user);
    if (name) store.setUser(name);
    if (!denied) startRouting();
    if (!name) pickUser({ required: true });
  });
}

if (store.CLOUD) {
  bootCloud();
} else {
  startRouting();
  if (!store.getUser()) pickUser({ required: true });
}

/* ---------- Aggiornamenti dell'app ---------- */

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      // Controlla se c'è una versione nuova ogni volta che l'app torna in primo piano.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('Service worker non registrato', e);
    }
  });

  // È arrivata una versione nuova: ricarica (se non si sta compilando un modulo).
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (document.querySelector('dialog[open]')) {
      toast('È disponibile una nuova versione', { label: 'Aggiorna', run: () => location.reload() });
      return;
    }
    reloading = true;
    location.reload();
  });
}
