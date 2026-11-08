import { pageHead } from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-cal)';

export default function calendario(root) {
  root.style.setProperty('--c', COLOR);
  root.innerHTML = `
    ${pageHead({ title: `<span class="badge-icon" style="--c:${COLOR}">${icon('calendar')}</span>Calendario` })}
    <section class="card coming">
      <div class="big">📅</div>
      <h2>In arrivo nella Fase 3</h2>
      <p>Qui vedrete gli impegni del calendario Google <strong>"Famiglia"</strong>, e potrete aggiungerne di nuovi direttamente dall'app.</p>
      <p>I promemoria arriveranno come notifiche dall'app Google Calendar che avete già sul telefono.</p>
    </section>`;
}
