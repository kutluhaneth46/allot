/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      opacity: {
        8: '0.08',
        12: '0.12',
      },
    },
  },
  plugins: [],
}
