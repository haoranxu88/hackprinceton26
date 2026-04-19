import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Copy knotapi-js UMD bundle to public/knotapi.js so the app can load it via /knotapi.js */
function copyKnotSdkToPublic() {
  const src = path.resolve(__dirname, "node_modules/knotapi-js/build/index.js");
  const publicDir = path.resolve(__dirname, "public");
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(src, path.resolve(publicDir, "knotapi.js"));
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-knot-sdk-to-public",
      buildStart() {
        copyKnotSdkToPublic();
      },
      configureServer() {
        copyKnotSdkToPublic();
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "::",
    port: 8080,
  },
});
