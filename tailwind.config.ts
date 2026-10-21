import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F1F24',
        canvas: '#F2F5F5',
        line: '#DCE3E3',
        brand: { DEFAULT: '#0B7A75', dark: '#08605C', soft: '#D7EEEC' },
      },
      fontFamily: { sans: ['var(--font-plex)', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config
