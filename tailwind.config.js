/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sunrise: {
          50:  '#fff1f2',
          100: '#ffe4e6',
          500: '#FF6B6B',
          600: '#e85555',
          700: '#c84545',
        }
      },
      fontFamily: { sans: ['Sarabun', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};
