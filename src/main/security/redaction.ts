// Redact secrets (tokens, codes) from any string before logging.
const PATTERNS: RegExp[] = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9-]{20,}/g, // OpenAI-style keys
  /"token"\s*:\s*"[^"]+"/g,
  /access_token=[^&\s]+/g
]

export function redactSecrets(input: string): string {
  let out = input
  for (const re of PATTERNS) {
    out = out.replace(re, '[REDACTED]')
  }
  return out
}
