import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react'
          if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'vendor-firebase'
          if (id.includes('/tone/') || id.includes('/standardized-audio-context/')) return 'vendor-audio'
          if (id.includes('/lamejs/')) return 'vendor-encoder'
          return 'vendor'
        },
      },
    },
  },
})
