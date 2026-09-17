import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  base: './', // Enables relative asset paths for seamless deployment to GitHub Pages (e.g. username.github.io/repo-name/)
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
