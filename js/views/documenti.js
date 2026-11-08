import { pageHead, avatar } from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-doc)';

// Anteprima della struttura che arriverà nella Fase 4.
const PREVIEW = [
  { label: 'Persone', items: [
    { lead: avatar('Andrea'), name: 'Andrea', sub: 'Documenti · Esami medici · …' },
    { lead: avatar('Laura'), name: 'Laura', sub: 'Documenti · Esami medici · …' },
    { lead: avatar('Claudia'), name: 'Claudia', sub: 'Documenti · Esami medici · …' },
  ] },
  { label: 'Veicoli', items: [
    { lead: icon('car'), name: 'Toyota Yaris', sub: 'Bollo · Revisione · Assicurazione' },
    { lead: icon('car'), name: 'Hyundai i10', sub: 'Bollo · Revisione · Assicurazione' },
    { lead: icon('car'), name: 'Camper', sub: 'Bollo · Revisione · Assicurazione' },
  ] },
  { label: 'Immobili', items: [
    { lead: icon('house'), name: 'Una cartella per ogni immobile', sub: 'Atti, utenze, manutenzioni…' },
  ] },
];

export default function documenti(root) {
  root.style.setProperty('--c', COLOR);
  root.innerHTML = `
    ${pageHead({ badge: icon('folder'), title: 'Documenti' })}
    <section class="card coming">
      <div class="big">🗂️</div>
      <h2>In arrivo nella Fase 4</h2>
      <p>I file saranno salvati nel Google Drive di famiglia, gratis. Le scadenze (bollo, revisione, carta d'identità, patente…) diventeranno eventi con promemoria sul calendario "Famiglia".</p>
    </section>
    <div class="preview" aria-label="Anteprima">
      ${PREVIEW.map((g) => `
        <section class="group">
          <h3 class="group-head"><span>${g.label}</span></h3>
          <div class="card rows">
            ${g.items.map((i) => `
              <div class="row">
                <span class="lead" aria-hidden="true">${i.lead}</span>
                <div class="row-main"><div class="row-title">${i.name}</div><div class="row-sub">${i.sub}</div></div>
              </div>`).join('')}
          </div>
        </section>`).join('')}
    </div>`;
}
