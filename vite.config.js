import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Hosts allowed to reach the dev server besides localhost. A leading dot allows every subdomain.
const allowedHosts = ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.io'];

// Path the app is served under. "/" locally; the GitHub Pages workflow sets BASE_PATH=/<repo>/.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173, strictPort: true, allowedHosts },
  preview: { port: 5173, strictPort: true, allowedHosts },
});
