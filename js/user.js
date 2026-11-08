// Scelta di "chi sono" su questo telefono.
// In Fase 2 verrà sostituita dal login con l'account Google personale.
import * as store from './store.js';
import { avatar } from './util.js';

export function pickUser({ required = false } = {}) {
  return new Promise((resolve) => {
    const current = store.getUser();
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = `
      <form method="dialog">
        <div class="grab"></div>
        <h2>${required ? 'Benvenuto in Casa Marchionni! 👋<br>Chi sei?' : 'Chi sta usando questo telefono?'}</h2>
        <div class="user-pick">
          ${store.MEMBERS.map((m) => `
            <button type="submit" value="${m}" aria-current="${m === current}">${avatar(m, 'lg')}${m}</button>`).join('')}
        </div>
        <p class="hint">Serve per mostrare chi ha aggiunto cosa. Più avanti useremo il login con il vostro account Google.</p>
      </form>`;
    document.body.append(dlg);
    dlg.addEventListener('cancel', (e) => {
      if (required) e.preventDefault();
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue) store.setUser(dlg.returnValue);
      dlg.remove();
      resolve(store.getUser());
    });
    if (!required) {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    }
    dlg.showModal();
  });
}
