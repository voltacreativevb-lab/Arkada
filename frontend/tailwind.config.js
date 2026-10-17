/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Archivo", "ui-sans-serif", "sans-serif"],
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#16191D",
        muted: "#545B64",
        line: "#D5D9DE",
        accent: "#1F4E6B",
        gold: "#F2B705",
        good: "#1E6B45",
        warn: "#FFF3C4",
        "warn-fg": "#4A3B00",
      },
    },
  },
  plugins: [],
};
