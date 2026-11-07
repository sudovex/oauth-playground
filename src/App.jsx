import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Fab,
  Fade,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Step,
  StepButton,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CallReceivedRoundedIcon from '@mui/icons-material/CallReceivedRounded';
import TokenRoundedIcon from '@mui/icons-material/TokenRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import {
  buildAuthorizationRequest,
  buildLogoutUrl,
  buildTokenRequest,
  clearPendingLogin,
  getPendingLogin,
  resolveEndpoints,
  savePendingLogin,
} from './oauth';
import { PROVIDERS, providerLabel } from './providers';
import {
  appUrl,
  CALLBACK_PATH,
  GRANT_TYPES,
  isConfigured,
  appHost,
  isDirectGrant,
  missingFields,
  redirectUri,
  setActiveApp,
  updateActiveApp,
  useApps,
  useSettings,
} from './settings';
import { logger, mask, redact } from './logger';
import { mono } from './theme';
import CallResult from './components/CallResult';
import CodeBlock from './components/CodeBlock';
import LogPanel from './components/LogPanel';
import SettingsDialog from './components/SettingsDialog';
import Tour, { isTourDone } from './components/Tour';

const FLOW_STEPS = {
  authorization_code: ['signin', 'callback', 'token', 'userinfo'],
  authorization_code_pkce: ['signin', 'callback', 'token', 'userinfo'],
  implicit: ['signin', 'callback', 'userinfo'],
  password: ['signin', 'token', 'userinfo'],
  client_credentials: ['signin', 'token'],
};
const STEP_LABELS = {
  default: { signin: 'Sign in', callback: 'Callback', token: 'Token request', userinfo: 'User info' },
  implicit: { callback: 'Callback + tokens' },
  password: { signin: 'Credentials', token: 'Token response' },
  client_credentials: { signin: 'Client', token: 'Token response' },
};
const grantLabel = (v) => GRANT_TYPES.find((g) => g.value === v)?.label || v;

/** Sends one HTTP request from the browser and captures everything about it for display. */
async function sendAndCapture(url, init) {
  const request = {
    url,
    method: init.method || 'GET',
    headers: init.headers || {},
    body: redact(init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body),
    rawBody: init.body instanceof URLSearchParams ? redact(init.body.toString()) : undefined,
    pageOrigin: window.location.origin,
  };

  const started = performance.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return {
      ok: res.ok,
      request,
      response: {
        status: res.status,
        statusText: res.statusText,
        timeMs: Math.round(performance.now() - started),
        headersVisibleToJs: Object.fromEntries(res.headers.entries()),
        body,
      },
    };
  } catch (err) {
    return {
      ok: false,
      request,
      networkError: {
        name: err.name,
        message: err.message,
        timeMs: Math.round(performance.now() - started),
        meaning:
          'The browser blocked or could not complete the request. "Failed to fetch" on a cross-origin call ' +
          'almost always means CORS: the response had no Access-Control-Allow-Origin matching ' +
          `${window.location.origin}. The server may still have processed it (in the code flow that uses up the code). ` +
          'Check the Console and Network tab for the exact reason.',
      },
    };
  }
}

const decodeJwt = (token) => {
  try {
    const [header, payload] = token.split('.').slice(0, 2).map((part) =>
      JSON.parse(decodeURIComponent(escape(atob(part.replace(/-/g, '+').replace(/_/g, '/')))))
    );
    return { header, payload };
  } catch {
    return null;
  }
};

/** Adds decoded copies of any JWT tokens in a successful token response. */
const decodeTokens = (result) => {
  const body = result.ok && result.response.body;
  if (!body || typeof body !== 'object') return;
  if (body.id_token) result.decodedIdToken = decodeJwt(body.id_token);
  if (body.access_token?.split('.').length === 3) result.decodedAccessToken = decodeJwt(body.access_token);
};

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export default function App() {
  const settings = useSettings();
  const configured = isConfigured(settings);
  const isCallback = window.location.pathname.startsWith(CALLBACK_PATH);

  const endpoints = resolveEndpoints(settings);
  const provider = PROVIDERS[settings.provider];
  // The login this tab started (state, nonce, PKCE verifier), saved before the redirect.
  const pending = getPendingLogin();

  // Callback values can arrive in the query (?…, code flows and some implicit implementations)
  // or in the fragment (#…, standard implicit).
  const params = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const fromUrl = (k) => params.get(k) ?? fragment.get(k);
  const code = params.get('code');
  const returnedState = fromUrl('state');
  const idpError = fromUrl('error');
  const storedState = pending?.state ?? null;
  const implicitTokens =
    isCallback && (fromUrl('access_token') || fromUrl('id_token'))
      ? {
          receivedIn: params.get('access_token') || params.get('id_token') ? 'query string (?…)' : 'URL fragment (#…)',
          access_token: fromUrl('access_token'),
          id_token: fromUrl('id_token'),
          token_type: fromUrl('token_type'),
          expires_in: fromUrl('expires_in'),
          scope: fromUrl('scope'),
        }
      : null;

  // The callback URL decides the flow there; elsewhere the selected grant type does.
  const flow = isCallback
    ? implicitTokens
      ? 'implicit'
      : (pending?.grantType || settings.grantType) === 'authorization_code_pkce'
        ? 'authorization_code_pkce'
        : 'authorization_code'
    : settings.grantType;
  const steps = FLOW_STEPS[flow] || FLOW_STEPS.authorization_code;

  const [tokenCall, setTokenCall] = useState(null);
  const [userCall, setUserCall] = useState(null);
  const [busy, setBusy] = useState('');
  const [logs, setLogs] = useState(logger.get());
  const [logsOpen, setLogsOpen] = useState(false);
  const { apps } = useApps();
  const [dialog, setDialog] = useState({ open: false, appId: null });
  const openSettings = () => setDialog({ open: true, appId: settings.id }); // no active app = "Add app"
  const openAddApp = () => setDialog({ open: true, appId: null });
  const appSwitcherRef = useRef(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [step, setStep] = useState(isCallback ? 1 : 0);
  const settingsBtnRef = useRef(null);
  const grantRef = useRef(null);
  const logsFabRef = useRef(null);

  useEffect(() => logger.subscribe(setLogs), []);

  // First visit: walk through where things are. Opened after mount so the target refs exist.
  useEffect(() => {
    if (!isTourDone() && !isCallback) setTourOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tourSteps = [
    {
      target: () => settingsBtnRef.current,
      placement: 'bottom-end',
      title: 'Start here: Settings',
      body: 'Click the gear to add your OAuth app: pick a provider (or Custom with your own endpoints), then the client ID and secret. Saved only in this browser.',
    },
    {
      target: () => appSwitcherRef.current,
      placement: 'bottom',
      title: 'Switch between apps',
      body: 'Save as many apps as you like (UAT, prod, cloud…). Pick one here by name and domain, or choose "Add app".',
    },
    {
      target: () => grantRef.current,
      placement: 'bottom',
      title: 'Choose the grant type',
      body: 'Authorization code, PKCE, implicit, password or client credentials. Switch any time; the steps change to match, and the choice is saved with your settings.',
    },
    {
      target: () => logsFabRef.current,
      placement: 'left-end',
      title: 'Logs',
      body: 'Every step and every request/response is recorded here. Open it whenever something fails.',
    },
  ];

  const changeGrantType = (e) => {
    const grantType = e.target.value;
    updateActiveApp({ grantType });
    logger.info('settings', `Grant type changed to ${grantType}`);
  };

  const switchApp = (e) => {
    const id = e.target.value;
    if (id === '__add') {
      openAddApp();
      return;
    }
    if (id === settings.id) return;
    const app = apps.find((a) => a.id === id);
    setActiveApp(id);
    logger.info('settings', `Switched to app "${app?.name}"`, { host: app && appHost(app), grantType: app?.grantType });
  };

  // Any change to which server/client/grant we're testing cancels the current run and starts at step 1.
  // Covers the app switcher, the grant type switcher and editing the active app in Settings.
  const abortRef = useRef(null);
  const [runId, setRunId] = useState(0);
  const flowSignature = [settings.id, settings.provider, endpoints.authorization, endpoints.token, settings.clientId, settings.grantType].join('|');
  const lastSignature = useRef(flowSignature);

  const resetFlow = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Pending redirect login; it belongs to the previous app/grant.
    clearPendingLogin();
    if (isCallback) {
      // The callback URL (code/tokens) belongs to the previous app/grant; leave it.
      window.location.replace(appUrl());
      return;
    }
    setStep(0);
    setTokenCall(null);
    setUserCall(null);
    setBusy('');
    setRunId((n) => n + 1);
  };

  useEffect(() => {
    if (lastSignature.current === flowSignature) return;
    lastSignature.current = flowSignature;
    logger.info('flow', 'App or grant type changed: current flow cancelled, starting from step 1', {
      app: settings.name || '(none)',
      provider: providerLabel(settings.provider),
      grantType: settings.grantType,
    });
    resetFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowSignature]);

  /** sendAndCapture, cancelled by resetFlow(). Returns null when it was cancelled. */
  const send = async (url, init) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await sendAndCapture(url, { ...init, signal: controller.signal });
    if (controller.signal.aborted) {
      logger.warn('flow', 'Request cancelled because the app or grant type changed', { url });
      return null;
    }
    if (abortRef.current === controller) abortRef.current = null;
    return result;
  };

  useEffect(() => {
    if (!isCallback) return;
    logger.info('callback', 'Returned to redirect URI', {
      fullUrl: window.location.href,
      queryParams: Object.fromEntries(params.entries()),
      fragmentParams: Object.fromEntries(fragment.entries()),
      detectedFlow: flow,
      pendingLogin: pending,
      stateMatches: storedState === returnedState,
    });
    if (implicitTokens?.id_token) {
      logger.info('callback', 'Decoded id_token from the redirect', decodeJwt(implicitTokens.id_token));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accessToken =
    flow === 'implicit' ? implicitTokens?.access_token : tokenCall?.ok && tokenCall.response.body?.access_token;
  const user = userCall?.ok && typeof userCall.response.body === 'object' ? userCall.response.body : null;

  const reachable = (key) =>
    key === 'signin' ||
    (key === 'callback' && isCallback) ||
    (key === 'token' && (isDirectGrant(flow) ? !!tokenCall : isCallback && !!code)) ||
    (key === 'userinfo' && !!accessToken);
  const isDone = (key) =>
    ({
      signin: isCallback || (isDirectGrant(flow) && !!tokenCall?.ok),
      callback: !!(code || implicitTokens),
      token: !!accessToken,
      userinfo: !!user,
    })[key];
  let maxStep = 0;
  while (maxStep + 1 < steps.length && reachable(steps[maxStep + 1])) maxStep++;
  // Never render a step the current flow can't reach (e.g. for one render right after the grant type changes).
  const activeStep = Math.min(step, maxStep);
  const stepKey = steps[activeStep];
  const goTo = (key) => setStep(steps.indexOf(key));

  // Redirect flows: authorization code, PKCE and implicit go through the provider's login page.
  const login = async () => {
    if (!configured) {
      openSettings();
      return;
    }
    logger.clear();
    logger.info('login', 'Settings', mask({ ...settings, endpoints, redirectUri: redirectUri() }));
    const request = await buildAuthorizationRequest(settings);
    savePendingLogin(request.pending);
    logger.info('login', 'Redirecting to the authorization endpoint', {
      authorizationEndpoint: endpoints.authorization,
      params: mask(request.params),
      pkce: request.pending.codeVerifier
        ? mask({ code_verifier: request.pending.codeVerifier, code_challenge: request.pending.codeChallenge })
        : undefined,
      fullUrl: request.url,
    });
    window.location.assign(request.url);
  };

  // Password grant: no redirect, the browser posts the user's credentials straight to the token endpoint.
  const passwordLogin = async (username, password) => {
    if (!configured) {
      openSettings();
      return;
    }
    logger.clear();
    logger.info('login', 'Settings', mask({ ...settings }));
    setBusy('password');
    setUserCall(null);
    const { url, init } = buildTokenRequest(settings, { grant_type: 'password', username, password, scope: settings.scope });
    logger.info('token', 'Password grant: posting credentials to the token endpoint', { url, username });
    const result = await send(url, init);
    if (!result) return;
    decodeTokens(result);
    logger[result.ok ? 'info' : 'error']('token', result.ok ? 'Password grant succeeded' : 'Password grant failed', mask(result));
    setTokenCall(result);
    setBusy('');
    goTo('token');
  };

  // Client credentials: the app authenticates as itself; no user, no redirect, no user info.
  const clientCredentialsLogin = async () => {
    if (!configured) {
      openSettings();
      return;
    }
    logger.clear();
    logger.info('login', 'Settings', mask({ ...settings }));
    setBusy('client');
    const { url, init } = buildTokenRequest(settings, { grant_type: 'client_credentials', scope: settings.scope });
    logger.info('token', 'Client credentials grant: requesting a token for the client itself', { url });
    const result = await send(url, init);
    if (!result) return;
    decodeTokens(result);
    logger[result.ok ? 'info' : 'error'](
      'token',
      result.ok ? 'Client credentials grant succeeded' : 'Client credentials grant failed',
      mask(result)
    );
    setTokenCall(result);
    setBusy('');
    goTo('token');
  };

  const makeTokenRequest = async () => {
    setBusy('token');
    setUserCall(null);

    const { url, init } = buildTokenRequest(settings, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: flow === 'authorization_code_pkce' ? pending?.codeVerifier : undefined,
    });
    if (flow === 'authorization_code_pkce' && !pending?.codeVerifier) {
      logger.warn('token', 'No PKCE code_verifier saved for this login (started in another tab?); the server will likely reject the code');
    }
    logger.info('token', 'Making token request from the browser', { url });
    const result = await send(url, init);
    if (!result) return;
    decodeTokens(result);
    logger[result.ok ? 'info' : 'error']('token', result.ok ? 'Token request succeeded' : 'Token request failed', mask(result));
    setTokenCall(result);
    setBusy('');
  };

  const makeUserInfoRequest = async () => {
    setBusy('user');
    const result = await send(endpoints.userinfo, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!result) return;
    logger[result.ok ? 'info' : 'error']('userinfo', result.ok ? 'Userinfo succeeded' : 'Userinfo failed', mask(result));
    setUserCall(result);
    setBusy('');
  };

  const startOver = () => (window.location.href = appUrl());

  // RP-initiated logout at the provider when it has an end-session endpoint; otherwise just start over.
  const logout = () => {
    const idToken = flow === 'implicit' ? implicitTokens?.id_token : tokenCall?.response?.body?.id_token;
    const url = buildLogoutUrl(settings, idToken);
    logger.info('logout', url ? 'Redirecting to the end-session endpoint' : 'No logout endpoint set; starting over', { url });
    clearPendingLogin();
    if (url) window.location.assign(url);
    else startOver();
  };
  const back = <NavButton dir="back" onClick={() => setStep(activeStep - 1)} />;
  const errorCount = logs.filter((l) => l.level === 'error').length;
  const stateChip = (
    <Chip
      size="small"
      color={storedState === returnedState ? 'success' : 'warning'}
      label={storedState === returnedState ? 'matches stored state' : 'does not match stored state'}
    />
  );
  const needsConfig = !configured && (
    <Alert
      severity="warning"
      variant="outlined"
      sx={{ mb: 2 }}
      action={
        <Button color="inherit" size="small" onClick={() => openSettings()}>
          Open settings
        </Button>
      }
    >
      Settings missing in this browser: {missingFields(settings).join(', ')}.
    </Alert>
  );

  return (
    <Box sx={{ minHeight: '100vh', pb: 12 }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: 'blur(12px)', borderBottom: 1, borderColor: 'divider', bgcolor: 'rgba(10,13,20,0.7)' }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <Avatar variant="rounded" sx={{ width: 34, height: 34, background: 'linear-gradient(135deg,#7c8cff,#22d3ee)' }}>
            <KeyRoundedIcon fontSize="small" />
          </Avatar>
          <Typography
            variant="h6"
            sx={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', visibility: { xs: 'hidden', md: 'visible' } }}
          >
            OAuth Client Tester
          </Typography>
          <TextField
            ref={appSwitcherRef}
            select
            size="small"
            label="App"
            value={settings.id ?? ''}
            onChange={switchApp}
            SelectProps={{
              displayEmpty: true,
              renderValue: () =>
                settings.id ? (
                  <Stack direction="row" spacing={1} alignItems="baseline" sx={{ minWidth: 0 }}>
                    <Box component="span" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {settings.name}
                    </Box>
                    <Box
                      component="span"
                      sx={{ fontFamily: mono, fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', display: { xs: 'none', sm: 'inline' } }}
                    >
                      {appHost(settings)}
                    </Box>
                  </Stack>
                ) : (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    No apps yet
                  </Box>
                ),
              MenuProps: { PaperProps: { sx: { maxHeight: 420, minWidth: 280 } } },
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: 140, sm: 300 }, '& .MuiInputBase-input': { fontSize: 13.5, py: 0.9 } }}
          >
            {apps.map((a) => (
              <MenuItem key={a.id} value={a.id} sx={{ py: 1 }}>
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <AppsRoundedIcon fontSize="small" color={a.id === settings.id ? 'primary' : 'inherit'} />
                </ListItemIcon>
                <ListItemText
                  primary={a.name}
                  secondary={`${appHost(a) || providerLabel(a.provider)} · ${grantLabel(a.grantType)}`}
                  primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                  secondaryTypographyProps={{ fontFamily: mono, fontSize: 12 }}
                />
              </MenuItem>
            ))}
            {apps.length > 0 && <Divider />}
            <MenuItem value="__add" sx={{ color: 'primary.main', py: 1 }}>
              <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>
                <AddRoundedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Add app" primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
            </MenuItem>
          </TextField>
          <TextField
            ref={grantRef}
            select
            size="small"
            label="Grant type"
            value={settings.grantType}
            onChange={changeGrantType}
            disabled={!settings.id}
            sx={{ width: { xs: 120, sm: 220 }, '& .MuiInputBase-input': { fontSize: 13.5, py: 0.9 } }}
          >
            {GRANT_TYPES.map((g) => (
              <MenuItem key={g.value} value={g.value}>
                {g.label}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="Show tour">
            <IconButton onClick={() => setTourOpen(true)} aria-label="Show tour" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
              <HelpOutlineRoundedIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={settings.id ? `Edit "${settings.name}"` : 'Add app'}>
            <IconButton ref={settingsBtnRef} onClick={() => openSettings()} aria-label="Open settings">
              <Badge color="warning" variant="dot" invisible={configured}>
                <SettingsRoundedIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ pt: 5 }}>
        <Stepper nonLinear activeStep={activeStep} alternativeLabel sx={{ mb: 5 }}>
          {steps.map((key, i) => {
            const label = STEP_LABELS[flow]?.[key] || STEP_LABELS.default[key];
            return (
              <Step key={key} completed={isDone(key) && i !== activeStep} disabled={i > maxStep}>
                {i <= maxStep ? <StepButton onClick={() => setStep(i)}>{label}</StepButton> : <StepLabel>{label}</StepLabel>}
              </Step>
            );
          })}
        </Stepper>

        {(isCallback || activeStep > 0 || tokenCall) && (
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: -3, mb: 1.5 }}>
            <Button size="small" color="inherit" startIcon={<RestartAltRoundedIcon />} onClick={startOver}>
              Start over
            </Button>
          </Stack>
        )}

        <Fade in key={`${runId}-${flow}-${stepKey}`} timeout={350}>
          <Box>
            {stepKey === 'signin' && (
              <Home
                settings={settings}
                endpoints={endpoints}
                configured={configured}
                onLogin={login}
                onPasswordLogin={passwordLogin}
                onClientCredentials={clientCredentialsLogin}
                busy={busy === 'password' || busy === 'client'}
                onSettings={() => openSettings()}
                isCallback={isCallback}
                next={maxStep > 0 && <NavButton onClick={() => setStep(1)} />}
              />
            )}

            {stepKey === 'callback' && flow !== 'implicit' && (
              <StepCard
                icon={<CallReceivedRoundedIcon />}
                title="Callback received"
                subtitle={redirectUri()}
                footer={
                  <>
                    {back}
                    <NavButton onClick={() => goTo('token')} disabled={!code} label="Continue to token request" />
                  </>
                }
              >
                {idpError ? (
                  <Alert severity="error" variant="outlined">
                    <b>{idpError}</b> {fromUrl('error_description')}
                  </Alert>
                ) : (
                  <KeyValue
                    rows={[
                      ['code', code ?? '(missing)', true],
                      ['state', returnedState ?? '(missing)', true],
                      ['state check', stateChip],
                    ]}
                  />
                )}
              </StepCard>
            )}

            {stepKey === 'callback' && flow === 'implicit' && implicitTokens && (
              <StepCard
                icon={<CallReceivedRoundedIcon />}
                title="Tokens received (implicit)"
                subtitle={redirectUri()}
                footer={
                  <>
                    {back}
                    <NavButton onClick={() => goTo('userinfo')} disabled={!accessToken} label="Continue to user info" />
                  </>
                }
              >
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  With the implicit grant the provider returns the tokens directly in the redirect, so there is no
                  token request.
                </Typography>
                <KeyValue
                  rows={[
                    ['received in', implicitTokens.receivedIn],
                    ['access_token', implicitTokens.access_token ?? '(not returned)', !!implicitTokens.access_token],
                    ['id_token', implicitTokens.id_token ?? '(not returned)', !!implicitTokens.id_token],
                    ...['token_type', 'expires_in', 'scope'].filter((k) => implicitTokens[k]).map((k) => [k, implicitTokens[k]]),
                    ['state', returnedState ?? '(missing)', true],
                    ['state check', stateChip],
                  ]}
                />
                {!implicitTokens.access_token && (
                  <Alert severity="warning" variant="outlined" sx={{ mt: 2 }}>
                    No access_token in the redirect, so user info can't be fetched.{' '}
                    {provider?.implicitNote || 'Check the scope and the response_type the server allows.'}
                  </Alert>
                )}
                {implicitTokens.id_token && (
                  <Box sx={{ mt: 2.5 }}>
                    <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
                      Decoded id_token
                    </Typography>
                    <CodeBlock data={decodeJwt(implicitTokens.id_token) || '(not a JWT)'} />
                  </Box>
                )}
              </StepCard>
            )}

            {stepKey === 'token' && flow === 'client_credentials' && (
              <StepCard
                icon={<TokenRoundedIcon />}
                title="Token response (client credentials)"
                subtitle={`POST ${endpoints.token || '(no token endpoint set)'}`}
                action={
                  <Button
                    variant="contained"
                    onClick={clientCredentialsLogin}
                    disabled={busy === 'client'}
                    startIcon={busy === 'client' ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
                  >
                    Request again
                  </Button>
                }
                footer={
                  <>
                    {back}
                    <Button variant="outlined" color="inherit" startIcon={<RestartAltRoundedIcon />} onClick={startOver}>
                      Start over
                    </Button>
                  </>
                }
              >
                <Typography variant="body2" color="text.secondary">
                  The app authenticated as itself with its client ID and secret. The token represents the client, not a
                  user, so there is no user info step and no id_token.
                </Typography>
                {tokenCall && <CallResult call={tokenCall} />}
              </StepCard>
            )}

            {stepKey === 'token' && flow === 'password' && (
              <StepCard
                icon={<TokenRoundedIcon />}
                title="Token response (password grant)"
                subtitle={`POST ${endpoints.token || '(no token endpoint set)'}`}
                action={
                  <Button variant="outlined" startIcon={<LoginRoundedIcon />} onClick={() => goTo('signin')}>
                    Sign in again
                  </Button>
                }
                footer={
                  <>
                    {back}
                    <NavButton onClick={() => goTo('userinfo')} disabled={!accessToken} label="Continue to user info" />
                  </>
                }
              >
                <Typography variant="body2" color="text.secondary">
                  The username and password were posted straight to the token endpoint from this browser, so CORS
                  applies. The password is hidden in the request view and logs.
                </Typography>
                {tokenCall && <CallResult call={tokenCall} />}
              </StepCard>
            )}

            {stepKey === 'token' && !isDirectGrant(flow) && (
              <StepCard
                icon={<TokenRoundedIcon />}
                title="Token request"
                subtitle={`POST ${endpoints.token || '(no token endpoint set)'}`}
                action={
                  <Button
                    variant="contained"
                    onClick={makeTokenRequest}
                    disabled={busy === 'token' || !configured}
                    startIcon={busy === 'token' ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
                  >
                    {tokenCall ? 'Send again' : 'Make token request'}
                  </Button>
                }
                footer={
                  <>
                    {back}
                    <NavButton onClick={() => goTo('userinfo')} disabled={!accessToken} label="Continue to user info" />
                  </>
                }
              >
                {needsConfig}
                <Typography variant="body2" color="text.secondary">
                  Sent straight from this browser page, so CORS applies. An authorization code works only once; start
                  over for a fresh one.
                </Typography>
                {tokenCall && <CallResult call={tokenCall} />}
              </StepCard>
            )}

            {stepKey === 'userinfo' && (
              <StepCard
                icon={<PersonSearchRoundedIcon />}
                title="User info"
                subtitle={`GET ${endpoints.userinfo || '(no user info endpoint set)'}`}
                action={
                  <Button
                    variant="contained"
                    onClick={makeUserInfoRequest}
                    disabled={busy === 'user' || !accessToken}
                    startIcon={busy === 'user' ? <CircularProgress size={16} color="inherit" /> : <SendRoundedIcon />}
                  >
                    {userCall ? 'Fetch again' : 'Get user info'}
                  </Button>
                }
                footer={
                  <>
                    {back}
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<LogoutRoundedIcon />}
                      onClick={logout}
                    >
                      Logout
                    </Button>
                  </>
                }
              >
                {user && <UserProfile user={user} />}
                {userCall && <CallResult call={userCall} />}
                {!userCall && (
                  <Typography variant="body2" color="text.secondary">
                    Calls the userinfo endpoint with the access token from the previous step.
                  </Typography>
                )}
              </StepCard>
            )}
          </Box>
        </Fade>
      </Container>

      <Tooltip title="Show logs" placement="left">
        <Fab ref={logsFabRef} color="secondary" onClick={() => setLogsOpen(true)} sx={{ position: 'fixed', right: 24, bottom: 24 }} aria-label="Show logs">
          <Badge badgeContent={errorCount || logs.length} color={errorCount ? 'error' : 'primary'} max={99}>
            <TerminalRoundedIcon />
          </Badge>
        </Fab>
      </Tooltip>
      <LogPanel logs={logs} open={logsOpen} onClose={() => setLogsOpen(false)} />
      <SettingsDialog open={dialog.open} appId={dialog.appId} onClose={() => setDialog((d) => ({ ...d, open: false }))} />
      <Tour
        open={tourOpen}
        steps={tourSteps}
        onClose={() => setTourOpen(false)}
        onFinish={() => !configured && openSettings()}
        finishLabel={configured ? 'Done' : 'Open settings'}
      />
    </Box>
  );
}

function NavButton({ dir = 'next', label, ...props }) {
  return dir === 'back' ? (
    <Button color="inherit" startIcon={<ArrowBackRoundedIcon />} {...props}>
      Back
    </Button>
  ) : (
    <Button variant="outlined" endIcon={<ArrowForwardRoundedIcon />} {...props}>
      {label || 'Next'}
    </Button>
  );
}

function Home({ settings, endpoints, configured, onLogin, onPasswordLogin, onClientCredentials, busy, onSettings, isCallback, next }) {
  const isPassword = settings.grantType === 'password';
  const isClientCredentials = settings.grantType === 'client_credentials';
  const direct = isDirectGrant(settings.grantType);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const submitPassword = (e) => {
    e.preventDefault();
    if (username.trim() && password) onPasswordLogin(username.trim(), password);
  };

  return (
    <Card>
      <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
        <Stack spacing={1} alignItems="center" textAlign="center" sx={{ mb: 4 }}>
          <Typography variant="h4">Test your OAuth login</Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
            {isClientCredentials
              ? 'Client credentials grant: the app requests a token for itself using its client ID and secret. No user, no login page.'
              : isPassword
              ? 'Password grant: enter the user’s credentials and the app exchanges them for tokens directly, with no redirect.'
              : 'Sign in at your identity provider, then run the token and user-info calls one at a time to see exactly what the browser sends and receives.'}
          </Typography>

          {!configured ? (
            <Box sx={{ pt: 2 }}>
              <Button size="large" variant="contained" startIcon={<TuneRoundedIcon />} onClick={onSettings} sx={{ px: 4, py: 1.4 }}>
                {settings.id ? 'Finish app settings' : 'Add your first app'}
              </Button>
            </Box>
          ) : isClientCredentials ? (
            <Box sx={{ pt: 2 }}>
              <Button
                size="large"
                variant="contained"
                onClick={onClientCredentials}
                disabled={busy}
                startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <KeyRoundedIcon />}
                sx={{ px: 4, py: 1.4 }}
              >
                Request client token
              </Button>
            </Box>
          ) : isPassword ? (
            <Box
              component="form"
              onSubmit={submitPassword}
              sx={{ pt: 2, width: '100%', maxWidth: 380, textAlign: 'left' }}
            >
              <Stack spacing={2}>
                <TextField
                  label="Username or email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  fullWidth
                  helperText="Sent only to the token endpoint. Never stored or logged."
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPassword((v) => !v)} edge="end" aria-label="Toggle password visibility">
                          {showPassword ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  type="submit"
                  size="large"
                  variant="contained"
                  disabled={busy || !username.trim() || !password}
                  startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <LoginRoundedIcon />}
                  sx={{ py: 1.3 }}
                >
                  Login
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box sx={{ pt: 2 }}>
              <Button size="large" variant="contained" startIcon={<LoginRoundedIcon />} onClick={onLogin} sx={{ px: 4, py: 1.4 }}>
                {isCallback
                  ? 'Login again'
                  : settings.provider === 'custom'
                    ? `Login with ${settings.name || 'your IdP'}`
                    : `Login with ${providerLabel(settings.provider)}`}
              </Button>
            </Box>
          )}
        </Stack>

        <Divider sx={{ mb: 3 }} />

        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
            {settings.id ? 'Active app · stored in this browser' : 'Apps · stored in this browser'}
          </Typography>
          <Button size="small" startIcon={<SettingsRoundedIcon />} onClick={onSettings}>
            {settings.id ? 'Edit' : 'Add app'}
          </Button>
        </Stack>

        {configured ? (
          <KeyValue
            rows={[
              ['App name', settings.name],
              ['Provider', providerLabel(settings.provider)],
              ...(settings.provider === 'custom' ? [] : [['Base URL', settings.baseUrl, true]]),
              ...[
                ['Authorization endpoint', endpoints.authorization],
                ['Token endpoint', endpoints.token],
                ['User info endpoint', endpoints.userinfo],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => [k, v, true]),
              ['Client ID', settings.clientId, true],
              ['Client auth', settings.tokenAuthMethod],
              ['Client secret', settings.clientSecret ? '•'.repeat(12) : '(not set)'],
              ['Grant type', grantLabel(settings.grantType)],
              ['Scope', settings.scope],
              ...(direct ? [] : [['Redirect URI', redirectUri(), true]]),
            ]}
          />
        ) : (
          <Alert severity="warning" variant="outlined">
            {settings.id
              ? `"${settings.name}" is missing: ${missingFields(settings).join(', ')}. Open Settings to finish it.`
              : 'No apps saved in this browser yet. Add one: pick a provider (or Custom), then enter its endpoints and client credentials.'}
          </Alert>
        )}

        {!direct && (
          <Alert severity="info" variant="outlined" sx={{ mt: 3 }}>
            Register <b style={{ fontFamily: mono, wordBreak: 'break-all' }}>{redirectUri()}</b> as the Redirect-URL of
            your OAuth app at the identity provider.
          </Alert>
        )}

        {next && (
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 3 }}>
            {next}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function StepCard({ icon, title, subtitle, action, footer, children }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
          <Avatar variant="rounded" sx={{ bgcolor: 'rgba(124,140,255,0.12)', color: 'primary.main' }}>
            {icon}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6">{title}</Typography>
            <Typography sx={{ fontFamily: mono, fontSize: 12.5, color: 'text.secondary', wordBreak: 'break-all' }}>
              {subtitle}
            </Typography>
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
      {footer && (
        <>
          <Divider />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: { xs: 2.5, sm: 3 }, py: 2 }}>
            {footer}
          </Stack>
        </>
      )}
    </Card>
  );
}

function CopyText({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
      <Typography sx={{ fontFamily: mono, fontSize: 13, wordBreak: 'break-all' }}>{value}</Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton
          size="small"
          onClick={() =>
            navigator.clipboard
              ?.writeText(String(value))
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
              .catch(() => {})
          }
        >
          <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function KeyValue({ rows }) {
  return (
    <Table size="small">
      <TableBody>
        {rows.map(([k, v, copy]) => (
          <TableRow key={k} sx={{ '&:last-child td': { border: 0 } }}>
            <TableCell sx={{ color: 'text.secondary', width: 150, verticalAlign: 'top', pl: 0 }}>{k}</TableCell>
            <TableCell sx={{ pr: 0 }}>
              {copy ? <CopyText value={v} /> : typeof v === 'string' ? <Typography fontSize={14}>{v}</Typography> : v}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UserProfile({ user }) {
  const name =
    user.name ||
    [user.given_name || user.firstname || user.firstName, user.family_name || user.lastname || user.lastName]
      .filter(Boolean)
      .join(' ') ||
    user.username ||
    user.preferred_username ||
    user.email ||
    'User';
  const email = user.email || user.mail;
  const initials = String(name)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        p: 3,
        background: 'linear-gradient(135deg, rgba(124,140,255,0.10), rgba(34,211,238,0.06))',
      }}
    >
      <Stack direction="row" spacing={2.5} alignItems="center" sx={{ mb: 2.5 }}>
        <Avatar sx={{ width: 64, height: 64, fontSize: 24, fontWeight: 700, background: 'linear-gradient(135deg,#7c8cff,#22d3ee)' }}>
          {initials}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6">{String(name)}</Typography>
          {email && (
            <Typography color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              {email}
            </Typography>
          )}
          <Chip size="small" color="success" label="Signed in" sx={{ mt: 1 }} />
        </Box>
      </Stack>
      <KeyValue
        rows={Object.entries(user).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v), true])}
      />
    </Box>
  );
}
