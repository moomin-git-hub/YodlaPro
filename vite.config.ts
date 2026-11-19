import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwind(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  // every build gets a visible version (Profile → About), so an update is recognisable
  define: (() => {
    const n = new Date(Date.now() + 5 * 3600_000); const p = (x: number) => String(x).padStart(2, '0');
    return { __APP_VERSION__: JSON.stringify(`1.2.${p(n.getUTCMonth() + 1)}${p(n.getUTCDate())}.${p(n.getUTCHours())}${p(n.getUTCMinutes())}`), __BUILD_TIME__: JSON.stringify(`${p(n.getUTCDate())}.${p(n.getUTCMonth() + 1)}.${n.getUTCFullYear()} ${p(n.getUTCHours())}:${p(n.getUTCMinutes())}`) };
  })(),
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 1500 },
}));
