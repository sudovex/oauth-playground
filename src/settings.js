import { useSyncExternalStore } from 'react';

/**
 * Saved OAuth apps live only in this browser's localStorage (per origin), never in source files.
 * They stay until the user deletes them in the Settings dialog or clears site data.
 *
 * Shape: { activeId, apps: [{ id, name, baseUrl, clientId, clientSecret, scope, grantType, brokerUri }], maskSecretsInLogs }
 */
const STORAGE_KEY = 'oauth-tester:apps:v2';
const LEGACY_KEY = 'mo-sso-tester:settings:v1'; // single-app format, migrated on first load

export const GRANT_TYPES = [
  { value: 'authorization_code', label: 'Authorization code' },
  { value: 'authorization_code_pkce', label: 'Authorization code + PKCE' },
  { value: 'implicit', label: 'Implicit' },
  { value: 'password', label: 'Password' },
  { value: 'client_credentials', label: 'Client credentials' },
];

/** Grant types that need the client secret. */
export const needsSecret = (grantType) =>
  grantType === 'authorization_code' || grantType === 'password' || grantType === 'client_credentials';

/** Grant types that call the token endpoint directly, without redirecting to the login page. */
export const isDirectGrant = (grantType) => grantType === 'password' || grantType === 'client_credentials';

export const DEFAULT_APP = {
  name: '',
  baseUrl: '',
  clientId: '',
  clientSecret: '',
  scope: 'openid email profile',
  grantType: 'authorization_code',
  brokerUri: '',
};

/** Path the app is served under: "/" locally, "/<repo>/" on GitHub Pages. Always ends with "/". */
export const APP_BASE = import.meta.env.BASE_URL;
export const CALLBACK_PATH = `${APP_BASE}sso/callback`;
export const appUrl = (path = '') => `${window.location.origin}${APP_BASE}${path}`;
export const redirectUri = () => appUrl('sso/callback');
export const logoutRedirectUri = () => appUrl();

export const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url || '';
  }
};

const newId = () =>
  globalThis.crypto?.randomUUID?.() || `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeApp = (a) => ({
  ...DEFAULT_APP,
  ...a,
  name: (a.name || '').trim() || hostOf((a.baseUrl || '').trim()) || 'Untitled app',
  baseUrl: (a.baseUrl || '').trim().replace(/\/+$/, ''),
  clientId: (a.clientId || '').trim(),
  clientSecret: (a.clientSecret || '').trim(),
  scope: (a.scope || '').trim().replace(/\s+/g, ' '),
  brokerUri: (a.brokerUri || '').trim(),
});

const EMPTY_STATE = { activeId: null, apps: [], maskSecretsInLogs: false };

const read = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...EMPTY_STATE, ...parsed, apps: Array.isArray(parsed.apps) ? parsed.apps : [] };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const { maskSecretsInLogs = false, ...old } = JSON.parse(legacy);
      const app = { ...normalizeApp(old), id: newId() };
      const migrated = { activeId: app.id, apps: [app], maskSecretsInLogs };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
  } catch {
    /* storage blocked or corrupt */
  }
  return { ...EMPTY_STATE };
};

const derive = (s) => {
  const active = s.apps.find((a) => a.id === s.activeId) || s.apps[0] || null;
  return { ...DEFAULT_APP, ...(active || {}), id: active?.id ?? null, maskSecretsInLogs: !!s.maskSecretsInLogs };
};

let state = read();
let snapshot = derive(state);
const listeners = new Set();

const commit = (next) => {
  state = next;
  snapshot = derive(state);
  let ok = true;
  try {
    if (state.apps.length || state.maskSecretsInLogs) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    ok = false;
  }
  listeners.forEach((fn) => fn());
  return ok;
};

/** Settings of the active app (plus global options). */
export const getSettings = () => snapshot;
export const getAppsState = () => state;

/**
 * Creates (no id) or updates (id) an app and makes it active.
 * @returns {{ ok: boolean, id: string }} ok is false when the browser refused to store it.
 */
export const saveApp = (app, { maskSecretsInLogs } = {}) => {
  const id = app.id || newId();
  const clean = { ...normalizeApp(app), id };
  delete clean.maskSecretsInLogs;
  const exists = state.apps.some((a) => a.id === id);
  const apps = exists ? state.apps.map((a) => (a.id === id ? clean : a)) : [...state.apps, clean];
  const ok = commit({
    ...state,
    apps,
    activeId: id,
    maskSecretsInLogs: maskSecretsInLogs ?? state.maskSecretsInLogs,
  });
  return { ok, id };
};

/** Updates fields of the active app (used by the grant type switcher). */
export const updateActiveApp = (patch) => {
  const current = state.apps.find((a) => a.id === snapshot.id);
  return saveApp({ ...(current || DEFAULT_APP), ...patch });
};

export const setActiveApp = (id) => commit({ ...state, activeId: id });

export const deleteApp = (id) => {
  const apps = state.apps.filter((a) => a.id !== id);
  return commit({ ...state, apps, activeId: state.activeId === id ? apps[0]?.id ?? null : state.activeId });
};

export const clearAllApps = () => {
  commit({ ...EMPTY_STATE });
  try {
    // Leftovers from mo-oauth-sdk's last login attempt.
    sessionStorage.removeItem('state');
    sessionStorage.removeItem('code_verifier');
  } catch {
    /* storage blocked */
  }
};

export const isConfigured = (s = snapshot) =>
  Boolean(s.id && s.baseUrl && s.clientId && (!needsSecret(s.grantType) || s.clientSecret));

/** Fields that must be filled before login; empty array means ready. */
export const missingFields = (s = snapshot) => {
  if (!s.id) return ['an app'];
  const missing = [];
  if (!s.baseUrl) missing.push('Base URL');
  if (!s.clientId) missing.push('Client ID');
  if (needsSecret(s.grantType) && !s.clientSecret) missing.push('Client secret');
  return missing;
};

const subscribe = (fn) => {
  listeners.add(fn);
  // Keep tabs in sync when apps change in another tab.
  const onStorage = (e) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      state = read();
      snapshot = derive(state);
      fn();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
};

export const useSettings = () => useSyncExternalStore(subscribe, getSettings);
export const useApps = () => useSyncExternalStore(subscribe, getAppsState);
