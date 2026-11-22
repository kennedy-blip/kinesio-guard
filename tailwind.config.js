/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'sans-serif'
        ],
        mono: [
          'JetBrains Mono',
          'SF Mono',
          'ui-monospace',
          'Cascadia Code',
          'Menlo',
          'monospace'
        ]
      },
      colors: {
        obsidian: {
          950: '#05070F',
          900: '#090D1B',
          800: '#10172B'
        }
      }
    }
  },
  plugins: []
}
