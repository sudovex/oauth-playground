import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { installFetchLogger } from './fetchLogger';
import theme from './theme';
import App from './App.jsx';

// Install before anything calls fetch.
installFetchLogger();

// No StrictMode: it runs effects twice in dev.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
);
