/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
