/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        notion: {
          black: 'rgba(0,0,0,0.95)',
          blue: '#0075de',
          'blue-active': '#005bab',
          'blue-focus': '#097fe8',
          'blue-light': '#62aef0',
          'badge-bg': '#f2f9ff',
          'badge-text': '#097fe8',
          navy: '#213183',
          'warm-white': '#f6f5f4',
          'warm-dark': '#31302e',
          'warm-gray-500': '#615d59',
          'warm-gray-300': '#a39e98',
          teal: '#2a9d99',
          green: '#1aae39',
          orange: '#dd5b00',
          pink: '#ff64c8',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'notion-card': 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px',
        'notion-deep': 'rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px',
        'notion-btn-focus': '0 0 0 2px #097fe8',
      },
      borderRadius: {
        'notion-btn': '4px',
        'notion-card': '12px',
        'notion-featured': '16px',
        'notion-pill': '9999px',
      },
      maxWidth: {
        'notion': '1200px',
      },
    },
  },
  plugins: [],
};
