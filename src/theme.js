import { createTheme, alpha } from '@mui/material/styles';

const bg = '#0a0d14';
const paper = '#111622';
const border = 'rgba(148, 163, 184, 0.12)';

export const mono = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7c8cff' },
    secondary: { main: '#22d3ee' },
    success: { main: '#34d399' },
    error: { main: '#f87171' },
    warning: { main: '#fbbf24' },
    info: { main: '#60a5fa' },
    background: { default: bg, paper },
    divider: border,
    text: { primary: '#e6e9f2', secondary: '#8b93a7' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 600, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: bg,
          backgroundImage: `radial-gradient(1200px 600px at 10% -10%, ${alpha('#7c8cff', 0.12)}, transparent 60%),
             radial-gradient(900px 500px at 110% 10%, ${alpha('#22d3ee', 0.08)}, transparent 60%)`,
          backgroundAttachment: 'fixed',
        },
        '::selection': { background: alpha('#7c8cff', 0.35) },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none', border: `1px solid ${border}` },
      },
    },
    MuiCard: { defaultProps: { elevation: 0 } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 18 },
        containedPrimary: {
          background: 'linear-gradient(135deg, #7c8cff 0%, #5b6cf0 100%)',
          '&:hover': { background: 'linear-gradient(135deg, #8b99ff 0%, #6a7af5 100%)' },
        },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 40 } } },
    MuiTabs: { styleOverrides: { root: { minHeight: 40 } } },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: { root: { '&:before': { display: 'none' } } },
    },
  },
});

export default theme;
