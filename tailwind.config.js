/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sokolow: {
          50:  '#fff1f2',
          100: '#ffe0e3',
          200: '#ffc6cb',
          300: '#ff9aa2',
          400: '#ff5f6b',
          500: '#f82d3e',
          600: '#C8102E',
          700: '#a50d25',
          800: '#890d22',
          900: '#730f22',
          950: '#40040e',
        },
      },
    },
  },
  plugins: [],
};
