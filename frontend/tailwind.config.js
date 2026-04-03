/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        olive: {
          100: '#d9f99d', // light olive
          200: '#bef264', // olive accent
          300: '#65a30d', // olive green
          400: '#4d7c0f', // rich olive
          500: '#36401F', // earthy dark olive
        },
        primary: {
          100: '#d9f99d',
          200: '#bef264',
          300: '#65a30d',
          400: '#4d7c0f',
          500: '#36401F',
        },
        dark: {
          100: '#36401F',
          200: '#4d7c0f',
          300: '#65a30d',
          400: '#bef264',
          500: '#d9f99d',
        },
        surface: {
          nav: '#ffffff', // tab bar / solid chrome on cream pages
        },
        base: {
          100: '#fefce8', // soft cream
          200: '#6b7280', // neutral slate
          300: '#2c3e50', // fallback background color
          dark: {
            100: '#27292aff',
            200: '#6b7280',
            300: '#fefce8',
          },
        },
        'warm-gray': '#78716c', // warm gray
        rating: {
          starFilled: '#eab308',
          starEmpty: '#d1d5db',
        },
      },
      fontFamily: {
      }
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.title-shadow-sm': {
          textShadowColor: 'rgba(255, 255, 255, 1)',
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 2,
        },
        '.title-shadow-md': {
          textShadowColor: 'rgba(255, 255, 255, 1)',
          textShadowOffset: { width: 2, height: 2 },
          textShadowRadius: 4,
        },
      });
    },
  ],
}

