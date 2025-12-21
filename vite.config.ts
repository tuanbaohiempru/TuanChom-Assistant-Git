import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Expose all loaded env variables to process.env to work with both Gemini and Firebase config
      'process.env': JSON.stringify(env)
    }
  };
});