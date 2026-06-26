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
          soft: 'var(--accent-soft)',
          foreground: 'var(--accent-foreground)'
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
        // Routed through CSS variables so `data-rm-theme` re-skins typography.
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)']
      },
      borderRadius: {
        // Themeable radius scale (brutalist → 0, soft → large). `full` is fixed.
        none: '0px',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-xl)',
        '3xl': 'var(--radius-xl)',
        full: '9999px'
      }
    }
  },
  plugins: []
}
