/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base del backend de historial (ej. "http://localhost:8787"). Opcional: si falta, se usa el proxy "/api". */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
