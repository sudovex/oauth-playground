/**
 * A small, dependency-free OAuth 2.0 / OpenID Connect client for the browser.
 *
 * - Builds authorization requests (code, code + PKCE, implicit) with state, nonce and S256 PKCE.
 * - Builds token requests for every grant, with client_secret_post or client_secret_basic.
 * - Keeps the pending login (state, nonce, PKCE verifier) in sessionStorage, tied to the app that started it.
 * - Builds the RP-initiated logout URL.
 *
 * Network calls are made by the caller (App.jsx) so every request/response can be captured and shown.
 */
import { PROVIDERS } from './providers';
import { logoutRedirectUri, redirectUri } from './settings';

const PENDING_KEY = 'oauth-playground:pending-login';

const clean = (url) => (url || '').trim();

/** Endpoints for an app: from its provider preset, or the ones the user entered for "custom". */
export const resolveEndpoints = (app) => {
  if (app.provider === 'custom') {
    return {
      authorization: clean(app.authorizationEndpoint),
      token: clean(app.tokenEndpoint),
      userinfo: clean(app.userinfoEndpoint),
      endSession: clean(app.endSessionEndpoint),
    };
  }
  const preset = PROVIDERS[app.provider];
  const base = clean(app.baseUrl).replace(/\/+$/, '');
  const endpoints = preset?.endpoints && base ? preset.endpoints(base) : {};
  return {
    authorization: (preset?.supportsBroker && clean(app.brokerUri)) || endpoints.authorization || '',
    token: endpoints.token || '',
    userinfo: endpoints.userinfo || '',
    endSession: endpoints.endSession || '',
  };
};

// ---------- random values & PKCE (RFC 7636) ----------

const base64Url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** URL-safe random string; 32 bytes gives a 43-character PKCE code verifier. */
export const randomString = (bytes = 32) => base64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export const pkceChallenge = async (verifier) =>
  base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

// ---------- pending login ----------

export const savePendingLogin = (pending) => {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    /* storage blocked: the callback will report a missing state */
  }
};

export const getPendingLogin = () => {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY)) || null;
  } catch {
    return null;
  }
};

export const clearPendingLogin = () => {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage blocked */
  }
};

// ---------- authorization request (redirect flows) ----------

/**
 * Builds the authorization URL for code, code + PKCE or implicit, plus the pending-login record that the
 * callback checks. Nothing is stored or navigated here; see App.jsx login().
 */
export const buildAuthorizationRequest = async (app) => {
  const endpoints = resolveEndpoints(app);
  const pending = {
    appId: app.id,
    grantType: app.grantType,
    state: randomString(16),
    nonce: randomString(16),
    createdAt: new Date().toISOString(),
  };

  const params = new URLSearchParams({
    response_type: app.grantType === 'implicit' ? 'token' : 'code',
    client_id: app.clientId,
    redirect_uri: redirectUri(),
    scope: app.scope,
    state: pending.state,
  });
  // OIDC: binds the id_token to this login (required for implicit, harmless for code).
  if (/\bopenid\b/.test(app.scope)) params.set('nonce', pending.nonce);

  if (app.grantType === 'authorization_code_pkce') {
    pending.codeVerifier = randomString(32);
    pending.codeChallenge = await pkceChallenge(pending.codeVerifier);
    params.set('code_challenge', pending.codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  const separator = endpoints.authorization.includes('?') ? '&' : '?';
  return {
    url: `${endpoints.authorization}${separator}${params.toString()}`,
    params: Object.fromEntries(params),
    pending,
  };
};

// ---------- token request ----------

/**
 * Builds a POST to the token endpoint.
 * @param fields grant-specific fields, e.g. { grant_type: 'authorization_code', code, redirect_uri }
 *               Empty values are left out.
 */
export const buildTokenRequest = (app, fields) => {
  const body = new URLSearchParams();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const { grant_type: grantType, ...rest } = fields;
  body.set('grant_type', grantType);

  if (app.tokenAuthMethod === 'client_secret_basic' && app.clientSecret) {
    // RFC 6749 §2.3.1: form-encode id and secret, then Base64 "id:secret".
    const encode = (v) => encodeURIComponent(v).replace(/%20/g, '+');
    headers.Authorization = `Basic ${btoa(`${encode(app.clientId)}:${encode(app.clientSecret)}`)}`;
  } else {
    body.set('client_id', app.clientId);
    if (app.clientSecret) body.set('client_secret', app.clientSecret);
  }

  Object.entries(rest).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') body.set(k, v);
  });

  return { url: resolveEndpoints(app).token, init: { method: 'POST', headers, body } };
};

// ---------- logout ----------

/** RP-initiated logout URL, or null when the app has no end-session endpoint. */
export const buildLogoutUrl = (app, idToken) => {
  const { endSession } = resolveEndpoints(app);
  if (!endSession) return null;
  const params = new URLSearchParams({ post_logout_redirect_uri: logoutRedirectUri() });
  if (app.provider === 'custom') {
    params.set('client_id', app.clientId);
    if (idToken) params.set('id_token_hint', idToken);
  }
  return `${endSession}${endSession.includes('?') ? '&' : '?'}${params.toString()}`;
};

// ---------- discovery ----------

/** Accepts an issuer URL or a full discovery URL. */
export const discoveryUrlFor = (input) => {
  const url = clean(input).replace(/\/+$/, '');
  return /\.well-known\//.test(url) ? url : `${url}/.well-known/openid-configuration`;
};

/** Maps an OIDC discovery document to the custom-provider fields. */
export const endpointsFromDiscovery = (doc) => ({
  authorizationEndpoint: doc.authorization_endpoint || '',
  tokenEndpoint: doc.token_endpoint || '',
  userinfoEndpoint: doc.userinfo_endpoint || '',
  endSessionEndpoint: doc.end_session_endpoint || '',
});
