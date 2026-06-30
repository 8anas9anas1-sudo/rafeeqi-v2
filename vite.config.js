import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local development run two processes:
//   1) node server.js   → the Express API on http://localhost:3000
//   2) npm run dev       → the Vite dev server on http://localhost:5173
// This proxy forwards /api/* calls from the Vite dev server to the Express server so the
// frontend can always just call a relative "/api/..." URL, in dev and in production alike.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
