const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'src/**/*.{html,ts}')
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark mode colors
        'dark-bg': '#0f1419',
        'dark-card': '#1a1f3a',
        'dark-accent': '#2d3561',
        // Light mode colors
        'light-bg': '#f8fafc',
        'light-card': '#ffffff',
        'light-accent': '#e2e8f0',
        'light-border': '#cbd5e1',
        'light-text': '#1e293b',
        'light-text-muted': '#64748b',
        // Primary colors
        primary: '#22c55e',
        'primary-hover': '#16a34a',
        'primary-dark': '#15803d',
        'primary-light': '#4ade80',
        secondary: '#8b5cf6',
        'accent-gradient-start': '#4ade80',
        'accent-gradient-end': '#22c55e',
        'background-light': '#f6f6f8',
        'background-dark': '#161022',
        'card-dark': '#221933',
        'border-dark': '#443267',
        'text-muted': '#a492c9',
        // Login Page Specific
        'surface-dark': '#0f1419',
        'surface-card': '#1a1f3a',
        'border-green': '#2d3561',
        'card-border': '#333b5c',
        'text-secondary': '#a492c9',
        'sport-background': '#0f1419',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        lexend: ['"Lexend"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(180deg, rgba(22,16,34,0.3) 0%, rgba(22,16,34,1) 100%)',
      },
      boxShadow: {
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-in',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
