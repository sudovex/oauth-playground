import { useSyncExternalStore } from 'react';

/**
 * Saved OAuth apps live only in this browser's localStorage (per origin), never in source files.
 * They stay until the user deletes them in the Settings dialog or clears site data.
 *
 * Shape: { activeId, maskSecretsInLogs, apps: [{ id, name, provider, baseUrl, brokerUri,
 *          authorizationEndpoint, tokenEndpoint, userinfoEndpoint, endSessionEndpoint, discoveryUrl,
 *          clientId, clientSecret, tokenAuthMethod, scope, grantType }] }
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

export const TOKEN_AUTH_METHODS = [
  { value: 'client_secret_post', label: 'client_secret_post (in the form body)' },
  { value: 'client_secret_basic', label: 'client_secret_basic (Authorization header)' },
];

export const DEFAULT_APP = {
  name: '',
  provider: 'custom',
  // provider presets (e.g. miniOrange)
  baseUrl: '',
  // custom provider
  authorizationEndpoint: '',
  tokenEndpoint: '',
  userinfoEndpoint: '',
  endSessionEndpoint: '',
  discoveryUrl: '',
  tokenAuthMethod: 'client_secret_post',
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

/** Domain shown for an app in the switcher. */
export const appHost = (a) =>
  hostOf(a.provider === 'custom' ? a.authorizationEndpoint || a.tokenEndpoint || a.discoveryUrl : a.baseUrl);

const trimUrl = (v) => (v || '').trim();

const normalizeApp = (a) => ({
  ...DEFAULT_APP,
  ...a,
  name: (a.name || '').trim() || appHost(a) || 'Untitled app',
  baseUrl: (a.baseUrl || '').trim().replace(/\/+$/, ''),
  authorizationEndpoint: trimUrl(a.authorizationEndpoint),
  tokenEndpoint: trimUrl(a.tokenEndpoint),
  userinfoEndpoint: trimUrl(a.userinfoEndpoint),
  endSessionEndpoint: trimUrl(a.endSessionEndpoint),
  discoveryUrl: trimUrl(a.discoveryUrl),
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
      const apps = (Array.isArray(parsed.apps) ? parsed.apps : []).map((a) =>
        a.provider ? a : { ...a, provider: 'miniorange' } // saved before providers existed
      );
      return { ...EMPTY_STATE, ...parsed, apps };
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const { maskSecretsInLogs = false, ...old } = JSON.parse(legacy);
      const app = { ...normalizeApp({ ...old, provider: 'miniorange' }), id: newId() };
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
    // Leftover pending login (state, nonce, PKCE verifier).
    sessionStorage.removeItem('oauth-playground:pending-login');
  } catch {
    /* storage blocked */
  }
};

/** Fields that must be filled before the current grant can run; empty array means ready. */
export const missingFields = (s = snapshot) => {
  if (!s.id) return ['an app'];
  const missing = [];
  if (s.provider === 'custom') {
    if (!isDirectGrant(s.grantType) && !s.authorizationEndpoint) missing.push('Authorization endpoint');
    if (s.grantType !== 'implicit' && !s.tokenEndpoint) missing.push('Token endpoint');
  } else if (!s.baseUrl) {
    missing.push('Base URL');
  }
  if (!s.clientId) missing.push('Client ID');
  if (needsSecret(s.grantType) && !s.clientSecret) missing.push('Client secret');
  return missing;
};

export const isConfigured = (s = snapshot) => missingFields(s).length === 0;

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
