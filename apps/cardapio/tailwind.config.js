import garfeedPreset from '@garfeed/ui/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [garfeedPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { accent: 'var(--accent)', 'on-accent': 'var(--on-accent)', 'orange-text': '#C2410C' },
      fontFamily: {
        heading: ['"Nunito Variable"', 'Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
};
