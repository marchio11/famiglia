// Chi sta usando l'app.
// - Modalità locale: si sceglie il nome da un elenco.
// - Modalità cloud: si entra con Google; il nome viene preso dall'account
//   (se è Andrea, Laura o Claudia) oppure scelto una volta sola.
import * as store from './store.js';
import { avatar, esc } from './util.js';

let account = null; // { uid, email, logout }

export function setAccount(a) {
  account = a;
}

export function getAccount() {
  return account;
}

const nameKey = (uid) => `cm:name:${uid}`;

/** Nome da mostrare per un utente Google, se già noto. */
export function knownName(user) {
  try {
    const saved = localStorage.getItem(nameKey(user.uid));
    if (saved) return saved;
  } catch { /* ignora */ }
  const first = (user.displayName || '').trim().split(/\s+/)[0].toLowerCase();
  return store.MEMBERS.find((m) => m.toLowerCase() === first) || null;
}

function rememberName(name) {
  if (!account) return;
  try {
    localStorage.setItem(nameKey(account.uid), name);
  } catch { /* ignora */ }
}

export function pickUser({ required = false } = {}) {
  return new Promise((resolve) => {
    const current = store.getUser();
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    const title = required
      ? 'Benvenuto in Casa Marchionni! 👋<br>Chi sei?'
      : account ? 'Il tuo account' : 'Chi sta usando questo telefono?';
    dlg.innerHTML = `
      <form method="dialog">
        <div class="grab"></div>
        <h2>${title}</h2>
        ${account ? `<p class="hint account-line">Collegato come <strong>${esc(account.email)}</strong></p>` : ''}
        <div class="user-pick">
          ${store.MEMBERS.map((m) => `
            <button type="submit" value="${m}" aria-current="${m === current}">${avatar(m, 'lg')}${m}</button>`).join('')}
        </div>
        <p class="hint">${account
          ? 'Scegli il nome con cui compari nell\'app (es. "aggiunto da Laura").'
          : 'Serve per mostrare chi ha aggiunto cosa.'}</p>
        ${account && !required ? '<div class="actions"><button type="button" class="btn ghost" data-logout>Esci dall\'account</button></div>' : ''}
      </form>`;
    document.body.append(dlg);
    dlg.addEventListener('cancel', (e) => {
      if (required) e.preventDefault();
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue && dlg.returnValue !== 'logout') {
        rememberName(dlg.returnValue);
        store.setUser(dlg.returnValue);
      }
      dlg.remove();
      resolve(store.getUser());
    });
    dlg.querySelector('[data-logout]')?.addEventListener('click', () => {
      dlg.close('logout');
      account.logout();
    });
    if (!required) {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    }
    dlg.showModal();
  });
}
