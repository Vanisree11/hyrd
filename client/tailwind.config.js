/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: { 950: '#050505', 900: '#0a0a0a', 800: '#111111', 700: '#181818', 600: '#222222', 500: '#2e2e2e' }, hyrd: { DEFAULT: '#ff6a00', 400: '#ff8a33', 500: '#ff6a00', 600: '#e65c00', 700: '#b84900' } },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
      boxShadow: { glow: '0 0 24px rgba(255,106,0,.35)', 'glow-sm': '0 0 12px rgba(255,106,0,.25)' },
      keyframes: { pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(255,106,0,.6)' }, '100%': { boxShadow: '0 0 0 10px rgba(255,106,0,0)' } }, fadeUp: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } }, scan: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(300%)' } } },
      animation: { pulseRing: 'pulseRing 1.4s infinite', fadeUp: 'fadeUp .35s ease both', scan: 'scan 1.6s linear infinite' },
    },
  },
  plugins: [],
};
