import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/, so the demo build sets VITE_BASE=/fieldcard/.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
})
