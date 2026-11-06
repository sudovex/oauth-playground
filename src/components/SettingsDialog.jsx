import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import {
  DEFAULT_APP,
  GRANT_TYPES,
  clearAllApps,
  deleteApp,
  getAppsState,
  logoutRedirectUri,
  needsSecret,
  redirectUri,
  saveApp,
} from '../settings';
import { mono } from '../theme';

const isHttpUrl = (v) => {
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const validate = (f) => {
  const e = {};
  if (!f.name.trim()) e.name = 'Give the app a name, e.g. "Staging"';
  if (!f.baseUrl.trim()) e.baseUrl = 'Required';
  else if (!isHttpUrl(f.baseUrl)) e.baseUrl = 'Must be an http(s) URL, e.g. https://login.xecurify.com/moas';
  if (!f.clientId.trim()) e.clientId = 'Required';
  if (needsSecret(f.grantType) && !f.clientSecret.trim())
    e.clientSecret = `Required for the ${GRANT_TYPES.find((g) => g.value === f.grantType)?.label.toLowerCase()} grant`;
  if (f.brokerUri.trim() && !isHttpUrl(f.brokerUri)) e.brokerUri = 'Must be an http(s) URL';
  if (!f.scope.trim()) e.scope = 'Required';
  return e;
};

/** Loads an existing app by id, or a blank one for "Add app" (appId null). */
const loadForm = (appId) => {
  const { apps, maskSecretsInLogs } = getAppsState();
  const app = apps.find((a) => a.id === appId);
  return { ...DEFAULT_APP, ...(app || {}), id: app?.id ?? null, maskSecretsInLogs };
};

export default function SettingsDialog({ open, appId, onClose }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState(() => loadForm(appId));
  const [touched, setTouched] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [confirm, setConfirm] = useState(null); // null | 'app' | 'all'
  const [saveError, setSaveError] = useState('');
  const isNew = !form.id;
  const appCount = getAppsState().apps.length;

  // Reload the stored values every time the dialog opens, so Cancel discards edits.
  useEffect(() => {
    if (!open) return;
    setForm(loadForm(appId));
    setTouched(false);
    setShowSecret(false);
    setConfirm(null);
    setSaveError('');
  }, [open, appId]);

  const errors = validate(form);
  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    const { maskSecretsInLogs, ...app } = form;
    if (!saveApp(app, { maskSecretsInLogs }).ok) {
      setSaveError('This browser blocked local storage, so the app will only last until the page reloads.');
      return;
    }
    onClose(true);
  };

  const removeApp = () => {
    deleteApp(form.id);
    onClose(true);
  };

  const removeAll = () => {
    clearAllApps();
    onClose(true);
  };

  const err = (k) => (touched ? errors[k] : undefined);

  return (
    <Dialog
      open={open}
      onClose={() => onClose(false)}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      PaperProps={{ component: 'form', onSubmit: save, noValidate: true, autoComplete: 'off', 'data-form-type': 'other' }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <SettingsRoundedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {isNew ? 'Add app' : 'Edit app'}
          {!isNew && (
            <Typography color="text.secondary" sx={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {form.name}
            </Typography>
          )}
        </Box>
        <IconButton onClick={() => onClose(false)} aria-label="Close settings">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          <Alert severity="info" variant="outlined">
            Saved only in this browser (local storage for {window.location.origin}), never in the app's files. Apps
            stay until you delete them here or clear the site's data. Switch between apps from the top bar.
          </Alert>

          <Section title="App">
            <TextField
              label="App name"
              placeholder="e.g. Staging, Production, Cloud demo"
              value={form.name}
              onChange={set('name')}
              error={!!err('name')}
              helperText={err('name') || 'Shown with the domain in the app switcher in the top bar'}
              required
              fullWidth
              autoFocus={isNew}
              inputProps={{ 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': true, 'data-form-type': 'other' }}
            />
          </Section>

          <Section title="Identity provider">
            <TextField
              label="Base URL"
              placeholder="https://login.xecurify.com/moas"
              value={form.baseUrl}
              onChange={set('baseUrl')}
              error={!!err('baseUrl')}
              helperText={err('baseUrl') || 'Cloud: https://<domain>.xecurify.com/moas · On-premise: your server URL'}
              required
              fullWidth
              InputProps={{ sx: { fontFamily: mono } }}
            />
            <TextField
              label="Broker URI (optional)"
              placeholder="Only when miniOrange brokers an external IdP"
              value={form.brokerUri}
              onChange={set('brokerUri')}
              error={!!err('brokerUri')}
              helperText={err('brokerUri') || 'Second URI under OAuth Endpoints → Authorization Endpoint'}
              fullWidth
              InputProps={{ sx: { fontFamily: mono } }}
            />
          </Section>

          <Section title="OAuth client">
            <TextField
              label="Client ID"
              value={form.clientId}
              onChange={set('clientId')}
              error={!!err('clientId')}
              helperText={err('clientId')}
              required
              fullWidth
              autoComplete="off"
              inputProps={{ 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': true, 'data-form-type': 'other' }}
              InputProps={{ sx: { fontFamily: mono } }}
            />
            <TextField
              label="Client secret"
              type={showSecret ? 'text' : 'password'}
              value={form.clientSecret}
              onChange={set('clientSecret')}
              error={!!err('clientSecret')}
              helperText={err('clientSecret') || 'Stored in this browser in plain text. Use test credentials.'}
              required={needsSecret(form.grantType)}
              fullWidth
              autoComplete="off"
              inputProps={{ 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-bwignore': true, 'data-form-type': 'other' }}
              InputProps={{
                sx: { fontFamily: mono },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowSecret((v) => !v)} edge="end" aria-label="Toggle secret visibility">
                      {showSecret ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Grant type" value={form.grantType} onChange={set('grantType')} fullWidth>
                {GRANT_TYPES.map((g) => (
                  <MenuItem key={g.value} value={g.value}>
                    {g.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Scope"
                value={form.scope}
                onChange={set('scope')}
                error={!!err('scope')}
                helperText={err('scope') || 'Space separated'}
                fullWidth
              />
            </Stack>
          </Section>

          <Section title="Redirect URLs" hint="Generated from where this app is hosted. Register them in the miniOrange OAuth app.">
            <ReadOnlyUrl label="Redirect-URL (callback)" value={redirectUri()} />
            <ReadOnlyUrl label="Logout URI" value={logoutRedirectUri()} />
          </Section>

          <Section title="Logs" hint="Applies to all apps.">
            <FormControlLabel
              control={<Switch checked={form.maskSecretsInLogs} onChange={set('maskSecretsInLogs')} />}
              label="Mask secrets and tokens in logs"
            />
          </Section>

          {appCount > 0 && (
            <Section title="Danger zone">
              <Box>
                <Button
                  color="error"
                  variant="outlined"
                  size="small"
                  startIcon={<DeleteForeverRoundedIcon />}
                  onClick={() => setConfirm('all')}
                >
                  Delete all apps ({appCount})
                </Button>
              </Box>
            </Section>
          )}

          {saveError && <Alert severity="warning">{saveError}</Alert>}
        </Stack>
      </DialogContent>

      {confirm ? (
        <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap', bgcolor: 'rgba(248,113,113,0.08)' }}>
          <Typography sx={{ mr: 'auto', fontSize: 14 }} color="error.light">
            {confirm === 'all'
              ? `Delete all ${appCount} saved apps from this browser?`
              : `Delete "${form.name}" from this browser?`}
          </Typography>
          <Button color="inherit" onClick={() => setConfirm(null)}>
            Keep
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteForeverRoundedIcon />}
            onClick={confirm === 'all' ? removeAll : removeApp}
          >
            Delete
          </Button>
        </DialogActions>
      ) : (
        <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
          {!isNew && (
            <Button color="error" startIcon={<DeleteForeverRoundedIcon />} onClick={() => setConfirm('app')} sx={{ mr: 'auto' }}>
              Delete app
            </Button>
          )}
          <Button color="inherit" onClick={() => onClose(false)} sx={isNew ? { ml: 'auto' } : undefined}>
            Cancel
          </Button>
          <Button type="submit" variant="contained">
            {isNew ? 'Add app' : 'Save'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}

function Section({ title, hint, children }) {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
          {title}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: -0.5 }}>
            {hint}
          </Typography>
        )}
      </Box>
      {children}
    </Stack>
  );
}

function ReadOnlyUrl({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});

  return (
    <TextField
      label={label}
      value={value}
      fullWidth
      InputProps={{
        readOnly: true,
        sx: { fontFamily: mono, fontSize: 13.5 },
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title={copied ? 'Copied' : 'Copy'}>
              <IconButton onClick={copy} edge="end" aria-label={`Copy ${label}`}>
                {copied ? <CheckRoundedIcon color="success" /> : <ContentCopyRoundedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
    />
  );
}
