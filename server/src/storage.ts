/**
 * "Bucket" local: almacenamiento de archivos en disco.
 * Cada corrida tiene su carpeta storage/<runId>/ con los .xlsx generados.
 * La ubicación base se puede cambiar con la env var STORAGE_DIR.
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Raíz del bucket. Por defecto server/storage. */
export const STORAGE_DIR = process.env.STORAGE_DIR
  ? resolve(process.env.STORAGE_DIR)
  : join(__dirname, "..", "storage");

/** Quita separadores de ruta y caracteres problemáticos del nombre de archivo. */
export function safeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim() || "archivo.bin";
}

/** Devuelve (creando la carpeta) la ruta absoluta destino para un archivo de una corrida. */
export function pathForRunFile(runId: string, filename: string): string {
  const dir = join(STORAGE_DIR, runId);
  mkdirSync(dir, { recursive: true });
  return join(dir, safeFilename(filename));
}

/** Asegura que exista la carpeta raíz del bucket al iniciar. */
export function ensureStorage(): void {
  mkdirSync(STORAGE_DIR, { recursive: true });
}
