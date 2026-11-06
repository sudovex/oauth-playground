import { OAuthConfig } from 'mo-oauth-sdk';
import { logoutRedirectUri, redirectUri } from './settings';

/** Endpoint paths mo-oauth-sdk builds from the base URL (not configurable in mo-oauth-sdk 1.0.0). */
export const ENDPOINTS = {
  authorize: '/idp/openidsso',
  token: '/rest/oauth/token',
  userinfo: '/rest/oauth/getuserinfo',
  introspect: '/rest/oauth/introspect',
  logout: '/idp/oidc/logout',
};

export const endpointUrl = (settings, name) => `${settings.baseUrl}${ENDPOINTS[name]}`;

export const buildOAuthConfig = (settings) => {
  const conf = new OAuthConfig();
  conf.setClientId(settings.clientId);
  conf.setClientSecret(settings.clientSecret);
  conf.setBaseUrl(settings.baseUrl);
  conf.setRedirectUri(redirectUri());
  conf.setLogoutRedirectUri(logoutRedirectUri());
  conf.setScope(settings.scope);
  conf.setGrantType(settings.grantType);
  if (settings.brokerUri) conf.setBrokerUri(settings.brokerUri);
  return conf;
};
