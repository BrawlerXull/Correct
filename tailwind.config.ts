import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FBF7F2",
        sand: "#F2EAE0",
        line: "#E6DBCD",
        ink: "#2A2320",
        muted: "#7A6D64",
        rose: { DEFAULT: "#B4505E", dark: "#8E3B48", soft: "#F4DDE0" },
        sage: { DEFAULT: "#6F9468", soft: "#E3EDDF" },
        apricot: { DEFAULT: "#D98A55", soft: "#F8E5D6" },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(42,35,32,.04), 0 8px 24px -12px rgba(42,35,32,.12)" },
    },
  },
  plugins: [],
};
export default config;
