import log from 'electron-log/main'
import { redactSecrets } from '../security/redaction'

let initialised = false

export function initLogger(): void {
  if (initialised) return
  initialised = true
  log.initialize()
  log.transports.file.level = 'info'
  log.transports.console.level = 'debug'
  // Redact secrets from every logged argument.
  log.hooks.push((message) => {
    message.data = message.data.map((d) => (typeof d === 'string' ? redactSecrets(d) : d))
    return message
  })
}

export const logger = {
  info: (...args: unknown[]) => log.info(...args),
  warn: (...args: unknown[]) => log.warn(...args),
  error: (...args: unknown[]) => log.error(...args),
  debug: (...args: unknown[]) => log.debug(...args),
  scope: (name: string) => log.scope(name)
}

export type Logger = typeof logger
