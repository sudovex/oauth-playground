import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CodeBlock from './CodeBlock';
import { logger } from '../logger';
import { mono } from '../theme';

const levelColor = { info: 'info', warn: 'warning', error: 'error' };

/** Logs live in a side drawer that opens only when the user asks for it. */
export default function LogPanel({ logs, open, onClose }) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 620 }, bgcolor: 'background.default', borderLeft: 1, borderColor: 'divider' } }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider', position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}
      >
        <TerminalRoundedIcon color="secondary" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          Logs
        </Typography>
        <Chip size="small" label={logs.length} />
        <Button size="small" color="inherit" startIcon={<DeleteSweepRoundedIcon />} onClick={logger.clear}>
          Clear
        </Button>
        <IconButton onClick={onClose} aria-label="Close logs">
          <CloseRoundedIcon />
        </IconButton>
      </Stack>

      {logs.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
          No logs yet. They also print to the browser console as <code>[OAuth Tester]</code>.
        </Typography>
      ) : (
        <Box>
          {logs.map((e, i) => (
            <Accordion key={i} sx={{ bgcolor: 'transparent', border: 0, borderBottom: 1, borderColor: 'divider', borderRadius: 0 }}>
              <AccordionSummary expandIcon={e.data !== undefined ? <ExpandMoreRoundedIcon /> : null}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, width: '100%' }}>
                  <Typography sx={{ fontFamily: mono, fontSize: 12, color: 'text.secondary', flexShrink: 0 }}>
                    {e.time.slice(11, 23)}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={levelColor[e.level]}
                    label={e.step}
                    sx={{ fontFamily: mono, fontSize: 11, flexShrink: 0 }}
                  />
                  <Typography sx={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.message}
                  </Typography>
                </Stack>
              </AccordionSummary>
              {e.data !== undefined && (
                <AccordionDetails sx={{ pt: 0 }}>
                  <CodeBlock data={e.data} maxHeight={360} />
                </AccordionDetails>
              )}
            </Accordion>
          ))}
        </Box>
      )}
    </Drawer>
  );
}
