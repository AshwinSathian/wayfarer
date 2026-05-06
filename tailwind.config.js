/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm:   '6px',
        DEFAULT: '10px',
        md:   '10px',
        lg:   '14px',
        xl:   '18px',
        '2xl': '24px',
        '3xl': '24px',
        full: '9999px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.3, 0, 0, 1)',
        enter:    'cubic-bezier(0, 0, 0, 1)',
        exit:     'cubic-bezier(0.3, 0, 1, 1)',
      },
      transitionDuration: {
        micro:    '80ms',
        quick:    '150ms',
        standard: '250ms',
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};
