import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        dock: resolve(__dirname, "src/dock/index.html"),
        overlay: resolve(__dirname, "src/overlay/index.html"),
        command: resolve(__dirname, "src/command/index.html"),
        fixture: resolve(__dirname, "tests/fixtures/app.html"),
      },
    },
  },
});
