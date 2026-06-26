/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: 'var(--background)',
          elevated: 'var(--background-elevated)',
          panel: 'var(--background-panel)',
          'panel-hover': 'var(--background-panel-hover)'
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)'
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        sev: {
          bug: 'var(--bug)',
          security: 'var(--security)',
          performance: 'var(--performance)',
          maintainability: 'var(--maintainability)',
          regression: 'var(--regression)'
        },
        diff: {
          'add-bg': 'var(--diff-add-bg)',
          'add-gutter': 'var(--diff-add-gutter)',
          'add-word': 'var(--diff-add-word)',
          'del-bg': 'var(--diff-del-bg)',
          'del-gutter': 'var(--diff-del-gutter)',
          'del-word': 'var(--diff-del-word)',
          'hunk-bg': 'var(--diff-hunk-bg)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Consolas', '"Liberation Mono"', 'monospace']
      }
    }
  },
  plugins: []
}
