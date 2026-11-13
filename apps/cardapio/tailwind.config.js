import garfeedPreset from '@garfeed/ui/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [garfeedPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Marca própria (planos com o recurso): os tokens de destaque e de texto escuro seguem as cores do restaurante.
      // Os padrões em index.css são os do Garfeed.
      colors: {
        accent: 'var(--accent)', 'on-accent': 'var(--on-accent)', 'orange-text': 'var(--accent-text)',
        gf: { orange: 'var(--accent)', 'orange-hover': 'var(--accent)', 'orange-soft': 'var(--accent-soft)', peach: 'var(--accent-peach)', navy: 'var(--brand-dark)' },
      },
      fontFamily: {
        heading: ['"Nunito Variable"', 'Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
};
