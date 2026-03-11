/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy tokens (keep for backward compat)
        primary: '#137fec',
        'primary-light': '#e7f2fd',
        'background-light': '#f6f7f8',
        'background-dark': '#101922',
        success: '#078838',
        danger: '#ef4444',
        'danger-light': '#fee2e2',

        // Semantic CSS-var tokens (light + dark aware)
        app: {
          bg:      'var(--app-bg)',
          surface: 'var(--surface-1)',
          surface2:'var(--surface-2)',
          surface3:'var(--surface-3)',
          border:  'var(--border-soft)',
        },
        content: {
          primary:  'var(--text-primary)',
          secondary:'var(--text-secondary)',
          muted:    'var(--text-muted)',
        },
        brand: {
          accent:       'var(--accent)',
          'accent-light':'var(--accent-light)',
          emerald:      'var(--emerald)',
          'emerald-strong':'var(--emerald-strong)',
          'emerald-hi': 'var(--emerald-hi)',
        },
        status: {
          success: 'var(--success)',
          danger:  'var(--danger)',
          warning: 'var(--warning)',
          info:    'var(--info)',
        },

        // Emerald crystal shades (static, for dark-first use)
        emerald: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      boxShadow: {
        'emerald-glow': '0 0 16px rgba(16,185,129,0.30)',
        'emerald-sm':   '0 0 8px rgba(16,185,129,0.20)',
      },
    },
  },
  plugins: [],
}
