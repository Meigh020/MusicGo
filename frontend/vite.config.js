import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El proxy reenvía /api/* del frontend (5173) al backend FastAPI (8000)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});