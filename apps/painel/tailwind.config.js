import preset from '@garfeed/ui/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { boxShadow: { card: '0 1px 2px rgb(20 36 51 / .06), 0 2px 8px rgb(20 36 51 / .04)' } } },
};
