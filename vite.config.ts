
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // HYBRID MODE: Expose API_KEY to allow client-side fallback if Cloud Functions fail/not deployed.
  // Note: For maximum security in production, try to rely on Cloud Functions.
  const safeEnv = {
    ...env,
    // Ensure API_KEY is passed if it exists in .env
    API_KEY: env.API_KEY || ''
  };

  return {
    // QUAN TRỌNG: Tắt copy thư mục public mặc định để tránh file index.html của Firebase đè lên app
    publicDir: false, 
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    plugins: [react()],
    define: {
      'process.env': JSON.stringify(safeEnv)
    }
  };
});
