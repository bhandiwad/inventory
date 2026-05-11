import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211c",
        leaf: "#1f7a4d",
        saffron: "#d97706",
        mist: "#f4f7f5"
      },
      boxShadow: {
        soft: "0 8px 24px rgba(23, 33, 28, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
