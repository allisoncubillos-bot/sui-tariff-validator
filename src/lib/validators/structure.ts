/**
 * Validador de estructura: cuenta exacta de columnas, headers oficiales,
 * tipos de dato esperados. No mira contenido numérico — solo "el esqueleto".
 */

import type { ValidationIssue, ValidationReport } from "../types.js";
import { T3_HEADERS, T7_HEADERS } from "../parsers/format-parsers.js";

export interface StructureCheckInput {
  format: "T3" | "T4" | "T7" | "T8";
  headers: (string | undefined)[];
  rowCount: number;
}

const T4_HEADERS_18 = T3_HEADERS;
const T4_HEADERS_20 = [
  "city_code", "Año Corregido", "Mes Corregido",
  "Cargo Horario", "Inicio Franja Horaria", "Fin Franja Horaria",
  "Estrato / Sector",
  "% Subsidiado 100% OR", "% Subsidiado 50% OR", "% Subsidiado 0% OR",
  "Tarifa Nivel 1 100% OR", "Tarifa Nivel 1 50% OR", "Tarifa Nivel 1 0% OR",
  "Tarifa Nivel 2", "Tarifa Nivel 3", "Tarifa Nivel 4",
  "Cfjm", "Fecha Publicación", "Diario de Publicacion", "Tarifa OT",
];
const T8_HEADERS_10 = T7_HEADERS;
const T8_HEADERS_12 = [
  "city_code", "Año Corregido", "Mes Corregido",
  "level", "gm", "tm", "rm", "dnm", "prnm", "cvm", "cuvm", "cargo_horario",
];

export function validateStructure({ format, headers, rowCount }: StructureCheckInput): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  const expected =
    format === "T3" ? T3_HEADERS :
    format === "T4" ? (headers.length >= 20 ? T4_HEADERS_20 : T4_HEADERS_18) :
    format === "T7" ? T7_HEADERS :
    /* T8 */          (headers.length >= 12 ? T8_HEADERS_12 : T8_HEADERS_10);

  if (rowCount < 1) {
    errors.push({ code: "EMPTY", message: `${format} no tiene filas de datos.` });
  }
  if (headers.length < expected.length) {
    errors.push({
      code: "COLUMNS_MISSING",
      message: `${format}: se esperaban ${expected.length} columnas y se encontraron ${headers.length}.`,
    });
  }
  for (let i = 0; i < expected.length; i++) {
    const got = (headers[i] ?? "").toString().trim().toLowerCase();
    const want = expected[i]!.trim().toLowerCase();
    if (got !== want) {
      warnings.push({
        code: "HEADER_NAME",
        message: `${format} col ${i + 1}: header "${headers[i] ?? ""}" ≠ esperado "${expected[i]}".`,
        ref: `R1C${i + 1}`,
      });
    }
  }

  return { format, passed: errors.length === 0, errors, warnings, info };
}
