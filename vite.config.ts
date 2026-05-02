import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  /** Capacitor / file 协议下需用相对路径，否则 JS/CSS 会 404 */
  base: './',
  plugins: [react(), tailwindcss()],
})
