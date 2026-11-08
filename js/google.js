// Permesso Google condiviso da Calendario e Documenti (Drive).
//
// Un solo tocco chiede a Google un "gettone" di accesso valido circa un'ora
// per entrambi i servizi. Senza un server (a pagamento) non si può fare di più:
// quando scade, l'app mostra i dati salvati e chiede un tocco per aggiornare.

import * as store from './store.js';
import { getAccount } from './user.js';

// Cambiando nome alla chiave, i vecchi permessi (solo calendario) vengono
// ignorati e Google chiede anche quello per Drive.
const TOKEN_KEY = () => `cm:g:${getAccount()?.uid || 'nessuno'}:token2`;

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

function readToken() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY()));
  } catch {
    return null;
  }
}
function saveToken(v) {
  try {
    if (v) localStorage.setItem(TOKEN_KEY(), JSON.stringify(v));
    else localStorage.removeItem(TOKEN_KEY());
  } catch { /* ignora */ }
}

export const available = () => store.CLOUD && !!getAccount();

export function connected() {
  const t = readToken();
  return !!(t && t.exp > Date.now() + 60_000);
}

/** Chiede il permesso a Google (apre una finestra: va chiamato da un tocco). */
export async function connect() {
  const value = await store.getCloud().googleToken();
  saveToken({ value, exp: Date.now() + 55 * 60_000 });
  emit();
}

export function forget() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('cm:g:') || k.startsWith('cm:cal:') || k.startsWith('cm:drive:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignora */ }
}

export class GoogleError extends Error {
  constructor(code, message, api = '') {
    super(message);
    this.code = code;
    this.api = api;
  }
}

/**
 * Chiamata autenticata alle API Google.
 * opts: { method, query, json (oggetto da inviare), body (Blob ecc.), headers, raw }
 * raw: true restituisce la risposta fetch invece del JSON.
 */
export async function request(url, { method = 'GET', query, json, body, headers = {}, raw = false } = {}) {
  if (!connected()) throw new GoogleError('auth', 'Serve il permesso di Google');
  const u = new URL(url);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(u, {
      method,
      headers: {
        Authorization: `Bearer ${readToken().value}`,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : body,
    });
  } catch {
    throw new GoogleError('offline', 'Nessuna connessione a internet');
  }
  if (res.status === 401) {
    saveToken(null);
    emit();
    throw new GoogleError('auth', 'Il permesso di Google è scaduto');
  }
  if (raw && res.ok) return res;
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const text = JSON.stringify(data);
    const api = /drive/i.test(text) || u.hostname.includes('upload') || u.pathname.includes('/drive/') ? 'drive' : 'calendar';
    const code = /accessNotConfigured|SERVICE_DISABLED/.test(text) ? 'disabled'
      : /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(text) ? 'scope'
        : res.status === 404 ? 'notfound'
          : res.status === 403 ? 'forbidden' : 'api';
    throw new GoogleError(code, data.error?.message || `Errore ${res.status}`, api);
  }
  return data;
}

/** Pagina della console per attivare un'API nel progetto giusto. */
export function enableApiUrl(err, service) {
  const num = String(err?.message || '').match(/project (\d+)/)?.[1];
  const project = num || store.firebaseProject() || '';
  return `https://console.cloud.google.com/apis/library/${service}?project=${project}`;
}

/** Messaggio comprensibile per un errore. */
export function explain(err) {
  if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return '';
  if (err?.code === 'auth/popup-blocked') return 'Il telefono ha bloccato la finestra di Google: riprova';
  if (err?.code === 'disabled') return `L'API Google ${err.api === 'drive' ? 'Drive' : 'Calendar'} non è ancora attivata nel progetto`;
  if (err?.code === 'scope') return 'Manca un permesso: tocca di nuovo "Collega" e spunta tutte le caselle';
  if (err?.code === 'offline') return 'Nessuna connessione a internet';
  if (err?.code === 'forbidden') return 'Non hai il permesso per questa operazione';
  if (err?.code === 'auth') return 'Il permesso di Google è scaduto: tocca per aggiornare';
  return err?.message || 'Qualcosa è andato storto';
}
