import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, las peticiones a /api se redirigen al backend de Express
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
