import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // ExcelJS es grande pero importable directo
    include: ["exceljs"],
  },
  build: {
    target: "es2022",
  },
});
