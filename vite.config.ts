/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/batomon-calculator/',
  plugins: [react()],
  test: {
    globals: true,
    // Only the component tests need a DOM. Building jsdom for the engine and data
    // suites as well costs more than running those tests.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['**/*.test.tsx'],
        },
      },
    ],
  },
})
