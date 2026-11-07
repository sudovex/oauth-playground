/**
 * Identity provider presets.
 *
 * A preset turns a single base URL into the full set of endpoints, so the user doesn't have to look them up.
 * "custom" has no preset: the user enters every endpoint (or loads them from an OIDC discovery document).
 *
 * To add a preset, add an entry with an `endpoints(baseUrl)` function and it appears in the Provider dropdown.
 */
export const PROVIDERS = {
  custom: {
    id: 'custom',
    label: 'Custom',
    description: 'Any OAuth 2.0 / OpenID Connect server. Enter each endpoint, or load them from a discovery document.',
  },
  miniorange: {
    id: 'miniorange',
    label: 'miniOrange',
    description: 'miniOrange cloud or on-premise. Enter the base URL and the endpoints are filled in.',
    baseUrlPlaceholder: 'https://<domain>.xecurify.com/moas',
    baseUrlHelp: 'Cloud: https://<domain>.xecurify.com/moas · On-premise: your server URL',
    // Optional: when miniOrange brokers an external IdP, the login starts at this URI instead.
    supportsBroker: true,
    endpoints: (base) => ({
      authorization: `${base}/idp/openidsso`,
      token: `${base}/rest/oauth/token`,
      userinfo: `${base}/rest/oauth/getuserinfo`,
      endSession: `${base}/idp/oidc/logout`,
    }),
    // miniOrange's /idp/openidsso returns implicit tokens in the query string, and only includes an
    // access_token when the scope has more than "openid".
    implicitNote:
      "miniOrange's /idp/openidsso only returns an access_token when the scope has more than just openid.",
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

export const providerLabel = (id) => PROVIDERS[id]?.label || 'Custom';
