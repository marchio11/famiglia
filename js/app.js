import * as store from './store.js';
import { pickUser } from './user.js';
import home from './views/home.js';
import spesa from './views/spesa.js';
import todo from './views/todo.js';
import liste from './views/liste.js';
import calendario from './views/calendario.js';
import documenti from './views/documenti.js';

const routes = { '': home, spesa, todo, liste, calendario, documenti };
const root = document.getElementById('app');
let cleanup = null;

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const view = routes[parts[0]] || home;
  if (cleanup) cleanup();
  cleanup = null;
  root.innerHTML = '';
  window.scrollTo(0, 0);
  cleanup = view(root, parts.slice(1)) || null;
}

window.addEventListener('hashchange', route);
route();

if (!store.getUser()) pickUser({ required: true });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non registrato', e));
  });
}
