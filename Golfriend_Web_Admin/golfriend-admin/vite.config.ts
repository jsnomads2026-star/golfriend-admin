import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build' && env.VITE_FIREBASE_PROJECT === 'partner-authority-local') {
    throw new Error('partner-authority-local is an emulator-only development mode and cannot be bundled for production.')
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
  }
})
