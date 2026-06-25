import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // The DB repository tests load the native better-sqlite3 module, which is
    // built for Electron's ABI by postinstall. Running them under plain-Node
    // Vitest requires a Node-ABI rebuild, so they are isolated out of the
    // default suite and run via `yarn test:db` (and a dedicated CI job).
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**', 'src/main/db/__tests__/**'],
    globals: true
  }
})
