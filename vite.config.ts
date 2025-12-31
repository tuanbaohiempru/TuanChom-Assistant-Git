
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // SECURE FIX: Remove API_KEY from the environment variables exposed to the client
  // Only expose safe variables (like FIREBASE config) Tuan
  const { API_KEY, ...safeEnv } = env;

  return {
    plugins: [react()],
    define: {
      'process.env': JSON.stringify(safeEnv)
    }
  };
});
