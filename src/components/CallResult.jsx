import { useState } from 'react';
import { Alert, Box, Chip, Stack, Tab, Tabs, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import CodeBlock from './CodeBlock';
import { mask } from '../logger';
import { mono } from '../theme';

const methodColor = { GET: 'info', POST: 'secondary' };

export default function CallResult({ call }) {
  const tabs = [
    'Response',
    'Request',
    ...(call.decodedIdToken ? ['id_token'] : []),
    ...(call.decodedAccessToken ? ['access_token'] : []),
  ];
  const [tab, setTab] = useState(0);
  const { request, response, networkError } = call;

  return (
    <Box sx={{ mt: 2.5, border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: call.ok ? 'rgba(52,211,153,0.07)' : 'rgba(248,113,113,0.07)',
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
          rowGap: 1,
        }}
      >
        {call.ok ? <CheckCircleRoundedIcon color="success" /> : <ErrorRoundedIcon color="error" />}
        <Chip size="small" label={request.method} color={methodColor[request.method] || 'default'} variant="outlined" />
        <Typography sx={{ fontFamily: mono, fontSize: 13, flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
          {request.url}
        </Typography>
        {networkError ? (
          <Chip size="small" color="error" label={`${networkError.name}: ${networkError.message}`} />
        ) : (
          <Chip
            size="small"
            color={call.ok ? 'success' : 'error'}
            label={`${response.status} ${response.statusText}`.trim()}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          {(response || networkError).timeMs} ms
        </Typography>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
        {tabs.map((t) => (
          <Tab key={t} label={t === 'Response' && networkError ? 'Error' : t} />
        ))}
      </Tabs>

      <Box sx={{ p: 2 }}>
        {tabs[tab] === 'Response' &&
          (networkError ? (
            <Stack spacing={2}>
              <Alert severity="error" variant="outlined">
                {networkError.meaning}
              </Alert>
              <CodeBlock data={networkError} />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Section title="Body">
                <CodeBlock data={mask(response.body)} />
              </Section>
              <Section title="Headers visible to JavaScript" hint="The Network tab shows every header; the browser hides non-safelisted ones from JS.">
                <CodeBlock data={response.headersVisibleToJs} maxHeight={220} />
              </Section>
            </Stack>
          ))}

        {tabs[tab] === 'Request' && (
          <Stack spacing={2}>
            <Section title="Headers">
              <CodeBlock data={{ Origin: request.pageOrigin, ...request.headers }} maxHeight={220} />
            </Section>
            {request.body && (
              <Section title="Form body">
                <CodeBlock data={mask(request.body)} />
              </Section>
            )}
            {request.rawBody && (
              <Section title="Raw body (as sent)">
                <CodeBlock data={request.rawBody} maxHeight={160} />
              </Section>
            )}
          </Stack>
        )}

        {tabs[tab] === 'id_token' && <CodeBlock data={call.decodedIdToken} />}
        {tabs[tab] === 'access_token' && <CodeBlock data={call.decodedAccessToken} />}
      </Box>
    </Box>
  );
}

function Section({ title, hint, children }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: -0.5, mb: 1 }}>
          {hint}
        </Typography>
      )}
      {children}
    </Box>
  );
}
