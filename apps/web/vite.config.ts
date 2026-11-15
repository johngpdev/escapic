import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

const here = import.meta.dirname;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "EscaPic",
        short_name: "EscaPic",
        description: "Turn any room into a mixed-reality detective case.",
        theme_color: "#04060b",
        background_color: "#04060b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the shell + fixtures so a wifi drop mid-demo is survivable.
        globPatterns: ["**/*.{js,css,html,svg,json,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/(health|warmup)/,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@escape/shared": resolve(here, "../../packages/shared/src/index.ts"),
    },
  },
  optimizeDeps: { exclude: ["@escape/shared"] },
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } },
  },
  build: { target: "es2022", sourcemap: true },
});
