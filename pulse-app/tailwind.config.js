import defaultTheme from 'tailwindcss/defaultTheme'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Premium dark base
        ink: {
          DEFAULT: '#0F1115',
          soft: '#151922',
          raised: '#1A1F2B',
        },
        // Neon mint / blue accents
        accent: {
          DEFAULT: '#00F2FE',
          soft: '#4FACFE',
        },
        // Text palette
        mist: {
          DEFAULT: '#E8ECF4',
          dim: '#9AA3B5',
          faint: '#5B6472',
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      borderRadius: {
        card: '20px',
        xl2: '24px',
      },
      boxShadow: {
        glow: '0 0 24px rgba(0, 242, 254, 0.25)',
        card: '0 8px 32px rgba(0, 0, 0, 0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'step-in': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.75)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.7)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.3s ease both',
        'slide-up': 'slide-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'step-in': 'step-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.4s infinite',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'pop-in': 'pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
}
