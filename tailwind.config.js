/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        saffron: {
          DEFAULT: '#FF9933',
          light: '#FFB366',
          dark: '#E68A2E',
        },
        'india-green': {
          DEFAULT: '#138808',
          light: '#1AAF0A',
        },
        navy: {
          DEFAULT: '#000080',
          light: '#1a1a9a',
        },
        cream: {
          DEFAULT: '#FFFDD0',
          dark: '#F5F5DC',
        },
        background: '#ffffff',
        foreground: '#1a1a2e',
        muted: {
          DEFAULT: '#f5f5f5',
          foreground: '#6b7280',
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: '#1a1a2e',
        },
        border: '#e5e7eb',
        input: '#e5e7eb',
        primary: {
          DEFAULT: '#FF9933',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#138808',
          foreground: '#ffffff',
        },
        accent: {
          DEFAULT: '#000080',
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
        ring: '#FF9933',
      },
      borderRadius: {
        sm: 'calc(0.5rem - 4px)',
        md: '0.5rem',
        lg: 'calc(0.5rem + 4px)',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        tillana: ['var(--font-tillana)', 'serif'],
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-out forwards',
        'slide-up': 'slide-up 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
};

