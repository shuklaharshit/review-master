import './loadEnv' // must be first: populates process.env from .env before constants are read
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { initLogger, logger } from './app/Logger'
import { buildServices, type Services } from './Services'
import { registerIpcHandlers } from './ipc/handlers'

let mainWindow: BrowserWindow | null = null
let services: Services | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#090B10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Don't throttle/suspend timers & requestAnimationFrame when the window is
      // occluded/backgrounded (macOS misreports occluded windows as hidden).
      // Otherwise rAF-driven UI (e.g. the diff minimap) and timers stall.
      backgroundThrottling: false,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Forward canonical app events to this window.
  services?.eventBus.setSender(mainWindow.webContents)

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    services?.eventBus.setSender(null)
    mainWindow = null
  })
}

// Single-instance lock.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    initLogger()
    logger.info('Review Master starting', { version: app.getVersion() })

    try {
      services = buildServices(app)
      registerIpcHandlers(services)
    } catch (error) {
      logger.error('Fatal: failed to initialise services', error)
    }

    // Warm up Codex detection in the background (non-blocking).
    services?.codex.getStatus().catch((e) => logger.warn('Codex warmup failed', e))

    // Auto-update check on launch if enabled.
    try {
      if (services?.settings.get().autoCheckUpdates) {
        services.updates.check().catch((e) => logger.warn('Update check failed', e))
      }
    } catch {
      /* ignore */
    }

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    void services?.codex.shutdown().catch(() => undefined)
    try {
      services?.db.close()
    } catch {
      /* ignore */
    }
  })
}
