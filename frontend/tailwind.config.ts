/** @type {import('tailwindcss').Config} */
import animate from "tailwindcss-animate";

const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        background: hsl("background"),
        foreground: hsl("foreground"),
        primary: {
          DEFAULT: hsl("primary"),
          foreground: hsl("primary-foreground"),
          edge: hsl("primary-edge"),
          bright: hsl("primary-bright"),
        },
        secondary: {
          DEFAULT: hsl("secondary"),
          foreground: hsl("secondary-foreground"),
        },
        destructive: {
          DEFAULT: hsl("destructive"),
          foreground: hsl("destructive-foreground"),
          edge: hsl("destructive-edge"),
        },
        success: {
          DEFAULT: hsl("success"),
          foreground: hsl("success-foreground"),
        },
        warning: {
          DEFAULT: hsl("warning"),
          foreground: hsl("warning-foreground"),
        },
        info: {
          DEFAULT: hsl("info"),
          foreground: hsl("info-foreground"),
        },
        muted: {
          DEFAULT: hsl("muted"),
          foreground: hsl("muted-foreground"),
        },
        accent: {
          DEFAULT: hsl("accent"),
          foreground: hsl("accent-foreground"),
        },
        popover: {
          DEFAULT: hsl("popover"),
          foreground: hsl("popover-foreground"),
        },
        card: {
          DEFAULT: hsl("card"),
          foreground: hsl("card-foreground"),
          soft: hsl("card-soft"),
        },
        ink: {
          success: hsl("ink-success"),
          warning: hsl("ink-warning"),
          info: hsl("ink-info"),
          danger: hsl("ink-danger"),
          purple: hsl("ink-purple"),
        },
        app: {
          pink: hsl("app-pink"),
          purple: hsl("app-purple"),
          blue: hsl("app-blue"),
          yellow: hsl("app-yellow"),
          orange: hsl("app-orange"),
          teal: hsl("app-teal"),
          green: hsl("app-green"),
          red: hsl("app-red"),
          brown: hsl("app-brown"),
        },
      },
      borderRadius: {
        "2xl": "calc(var(--radius) + 8px)",
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 6px)",
        sm: "calc(var(--radius) - 10px)",
      },
      boxShadow: {
        // 动森式「厚底边」：实色、无模糊，按下时去掉并下移
        edge: "0 4px 0 hsl(var(--edge))",
        "edge-sm": "0 2px 0 hsl(var(--edge))",
        "edge-primary": "0 4px 0 hsl(var(--primary-edge))",
        "edge-primary-sm": "0 2px 0 hsl(var(--primary-edge))",
        "edge-destructive": "0 4px 0 hsl(var(--destructive-edge))",
        "edge-success": "0 4px 0 hsl(var(--success-edge))",
        "edge-warning": "0 4px 0 hsl(var(--warning-edge))",
      },
      fontFamily: {
        sans: [
          '"Nunito Variable"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang SC"',
          '"HarmonyOS Sans SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          "sans-serif",
        ],
      },
    },
  },
  plugins: [animate],
};
