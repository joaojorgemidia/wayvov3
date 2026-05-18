import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-query':    ['@tanstack/react-query'],
          'vendor-radix':    [
            '@radix-ui/react-dialog', '@radix-ui/react-select',
            '@radix-ui/react-tabs', '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover', '@radix-ui/react-tooltip',
            '@radix-ui/react-accordion', '@radix-ui/react-alert-dialog',
            '@radix-ui/react-checkbox', '@radix-ui/react-label',
            '@radix-ui/react-radio-group', '@radix-ui/react-scroll-area',
            '@radix-ui/react-separator', '@radix-ui/react-switch',
            '@radix-ui/react-toast', '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group', '@radix-ui/react-slot',
            '@radix-ui/react-avatar', '@radix-ui/react-progress',
            '@radix-ui/react-slider',
          ],
          'vendor-charts':   ['recharts'],
          'vendor-maps':     ['leaflet', 'react-leaflet'],
          'vendor-xlsx':     ['xlsx'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-forms':    ['react-hook-form', '@hookform/resolvers', 'zod'],
          'vendor-dates':    ['date-fns'],
        },
      },
    },
  },
}));
