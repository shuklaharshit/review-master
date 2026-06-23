# 0006 — Preload bundled as CommonJS for the sandboxed renderer

**Status:** Accepted

## Context
`package.json` is `"type": "module"`, so electron-vite emits ESM by default. The window runs with `sandbox: true` + `contextIsolation: true`. A sandboxed Electron preload **cannot be an ES module** — it must be CommonJS — and the main process loads it from a fixed path.

## Decision
Force the preload build to emit CommonJS `out/preload/index.js` via `output: { format: 'cjs', entryFileNames: '[name].js' }` in `electron.vite.config.ts`. `main/index.ts` loads `../preload/index.js`.

## Consequences
- Keeps the strong security posture (sandbox on) while the preload bridge works.
- Don't "modernize" the preload to ESM or rename its output — login/IPC will silently break.
- The preload stays tiny: it only `contextBridge.exposeInMainWorld`s the typed `reviewMasterApi`.
