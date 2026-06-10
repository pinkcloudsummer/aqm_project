/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#000000',
        surface:  '#111111',
        's2':     '#1a1a1a',
        neon:     '#39ff14',
        mint:     '#00e5a0',
        'g-dark': '#1a3a2a',
        primary:  '#f0f0f0',
        muted:    '#666666',
        danger:   '#ff4444',
        warn:     '#ffaa00',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
