import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Hamrirespority/', // Must match your exact GitHub repository name!
});
