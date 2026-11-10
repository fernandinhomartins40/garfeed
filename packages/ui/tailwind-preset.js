// Preset Tailwind (v3: `presets: [garfeedPreset]` no tailwind.config). Cores apontam para as CSS vars
// de tokens.css — importe o tokens.css junto. Ex.: bg-gf-orange, text-gf-navy, rounded-card, font-heading.
/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        gf: {
          orange: 'var(--gf-orange)',
          'orange-hover': 'var(--gf-orange-hover)',
          'orange-soft': 'var(--gf-orange-soft)',
          navy: 'var(--gf-navy)',
          'navy-80': 'var(--gf-navy-80)',
          muted: 'var(--gf-muted)',
          border: 'var(--gf-border)',
          bg: 'var(--gf-bg)',
          cream: 'var(--gf-cream)',
          peach: 'var(--gf-peach)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        heading: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        pill: '999px',
        sheet: '20px',
        media: '24px',
      },
    },
  },
};
