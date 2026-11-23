import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  preview: {
    // Railway serves the preview on a generated *.up.railway.app host,
    // which Vite would otherwise reject as a disallowed host.
    allowedHosts: true,
  },
})

      