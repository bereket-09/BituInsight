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
          accent: '#632CA6',
          accentHover: '#7c3aed',
          success: '#00C853',
          warning: '#FF6B35',
          danger: '#f85149',
          info: '#1E88E5',
          muted: 'rgb(var(--noc-muted) / <alpha-value>)',
          text: 'rgb(var(--noc-text) / <alpha-value>)',
          textDim: 'rgb(var(--noc-text-dim) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        card: 'var(--shadow-card)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
