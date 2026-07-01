import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // ExcelJS es grande pero importable directo
    include: ["exceljs"],
  },
  server: {
    // Proxy al backend de historial para evitar CORS en desarrollo.
    // El backend escucha en 8787 (ver server/.env). Cambia el target si usas otro puerto.
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/health": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
  },
});
