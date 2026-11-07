import { getSettings } from './settings';

/**
 * Tiny logger: every entry goes to the browser console and to an on-page log panel.
 * Entries are kept in sessionStorage so the steps logged before the redirect to the identity provider
 * are still visible on the /sso/callback page.
 */
const STORAGE_KEY = 'mo_test_logs';
const listeners = new Set();

const load = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
};

let entries = load();

const save = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage full or blocked: logs stay in memory only */
  }
  listeners.forEach((fn) => fn(entries));
};

const SECRET_KEYS = /^(client_secret|code_verifier|access_token|refresh_token|id_token|authorization|code)$/i;

const maskValue = (v) =>
  typeof v === 'string' && v.length > 12 ? `${v.slice(0, 4)}…${v.slice(-4)} (len ${v.length})` : '****';

const PASSWORD_IN_FORM = /(^|&)password=[^&]*/g;

/** The end user's password is never logged or shown, whatever the mask setting. */
export const redact = (data) => {
  if (typeof data === 'string') return data.replace(PASSWORD_IN_FORM, '$1password=********');
  if (data == null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(redact);
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, /^password$/i.test(k) ? '********' : redact(v)])
  );
};

export const mask = (data) => {
  if (!getSettings().maskSecretsInLogs || data == null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(mask);
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, SECRET_KEYS.test(k) ? maskValue(v) : mask(v)])
  );
};

export const log = (level, step, message, data) => {
  const entry = { time: new Date().toISOString(), level, step, message, data: mask(redact(data)) };
  entries = [...entries, entry];

  const prefix = `[OAuth Tester][${step}] ${message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  data === undefined ? fn(prefix) : fn(prefix, entry.data);

  save();
};

export const logger = {
  info: (step, message, data) => log('info', step, message, data),
  warn: (step, message, data) => log('warn', step, message, data),
  error: (step, message, data) => log('error', step, message, data),
  clear: () => {
    entries = [];
    save();
  },
  get: () => entries,
  subscribe: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
