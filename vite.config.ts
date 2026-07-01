import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O front (webapp observador) roda no Vite; o backend (nós + observer) roda via tsx.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
