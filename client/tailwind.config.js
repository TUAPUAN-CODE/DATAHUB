/** Colors resolve to CSS variables (RGB triplets) written by src/lib/theme.ts,
 *  so every user theme applies instantly without rebuilding. */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: v('primary'), accent: v('accent'), app: v('bg'), surface: v('surface'), ink: v('text'),
        muted: v('muted'), line: v('border'), success: v('success'), warning: v('warning'), danger: v('danger'),
        side: v('sidebar'), sidetext: v('sidebarText'),
      },
      borderRadius: { theme: 'var(--radius)' },
      fontFamily: { sans: ['var(--font)', 'Prompt', 'system-ui', 'sans-serif'] },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        flash: { '0%': { backgroundColor: 'rgb(var(--c-primary) / .18)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: { shimmer: 'shimmer 1.4s infinite', flash: 'flash 1.2s ease-out' },
    },
  },
  plugins: [],
};
