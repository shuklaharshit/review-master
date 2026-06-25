import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Dedicated config for the DB repository tests. They load the native
// better-sqlite3 module, which must be built for the test runner's Node ABI
// (NOT Electron's). Run via `yarn test:db` after a Node-ABI rebuild:
//   npm rebuild better-sqlite3 --build-from-source && yarn test:db
// then restore the Electron build for the app with `yarn rebuild:electron`.
// CI runs this in a dedicated job (see .github/workflows/test.yml).
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
    include: ['src/main/db/__tests__/**/*.{test,spec}.ts'],
    globals: true
  }
})
