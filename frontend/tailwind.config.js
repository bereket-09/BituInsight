/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        noc: {
          bg: 'rgb(var(--noc-bg) / <alpha-value>)',
          surface: 'rgb(var(--noc-surface) / <alpha-value>)',
          card: 'rgb(var(--noc-card) / <alpha-value>)',
          border: 'rgb(var(--noc-border) / <alpha-value>)',
          accent: '#00B140',
          // Brighten on hover against a dark ground; darkening reads as disabled.
          accentHover: '#13C755',
          accentSoft: '#7CE0A0',
          success: '#3FB950',
          warning: '#FF6B35',
          danger: '#f85149',
          info: '#1E88E5',
          muted: 'rgb(var(--noc-muted) / <alpha-value>)',
          text: 'rgb(var(--noc-text) / <alpha-value>)',
          textDim: 'rgb(var(--noc-text-dim) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Geist over Inter: Inter is the default of every AI-generated dashboard,
        // and its neutrality reads as anonymous at display sizes.
        sans: ['Geist', 'Outfit', 'system-ui', 'sans-serif'],
        display: ['Geist', 'Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['clamp(2.25rem, 4vw, 3.25rem)', { lineHeight: '1.04', letterSpacing: '-0.035em', fontWeight: '700' }],
        'display-lg': ['clamp(1.75rem, 3vw, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-md': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
