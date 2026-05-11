/**
 * Definición declarativa de cada formato SUI.
 * El exportador la consume para escribir las columnas en el orden correcto,
 * aplicar tipos y formato (5 decimales obligatorios para valores tarifarios).
 *
 * Mantener esta única fuente de verdad evita que `generators` y `exporters`
 * se desincronicen entre sí. Si el SUI cambia un formato, se ajusta SOLO aquí.
 */

import type { T3Row, T4Row, T7Row, T8Row } from "../types.js";

export type SuiColType = "int" | "decimal5" | "string" | "date" | "time";

export interface SuiColumn<T> {
  header: string;
  field: keyof T | "_synthetic";
  type: SuiColType;
  /** Para campos sintéticos (no presentes en T) — los calcula el getter. */
  getter?: (row: T) => unknown;
  /** Ancho sugerido en caracteres para xlsx-writer (opcional). */
  width?: number;
}

export const T3_SPEC: SuiColumn<T3Row>[] = [
  { header: "city_code",               field: "cityCode",          type: "int",      width: 12 },
  { header: "Cargo Horario",           field: "cargoHorario",      type: "int",      width: 13 },
  { header: "Inicio Franja Horaria",   field: "inicioFranja",      type: "time",     width: 12 },
  { header: "Fin Franja Horaria",      field: "finFranja",         type: "time",     width: 12 },
  { header: "Estrato / Sector",        field: "estrato",           type: "int",      width: 14 },
  { header: "% Subsidiado 100% OR",    field: "pctSub100",         type: "int",      width: 14 },
  { header: "% Subsidiado 50% OR",     field: "pctSub50",          type: "int",      width: 14 },
  { header: "% Subsidiado 0% OR",      field: "pctSub0",           type: "int",      width: 14 },
  { header: "Tarifa Nivel 1 100% OR",  field: "tarifaN1_100",      type: "decimal5", width: 16 },
  // SUI spec: las columnas J y K vienen como 0% y 50% (orden invertido vs F/G/H)
  { header: "Tarifa Nivel 1 0% OR",    field: "tarifaN1_0",        type: "decimal5", width: 16 },
  { header: "Tarifa Nivel 1 50% OR",   field: "tarifaN1_50",       type: "decimal5", width: 16 },
  { header: "Tarifa Nivel 2",          field: "tarifaN2",          type: "decimal5", width: 14 },
  { header: "Tarifa Nivel 3",          field: "tarifaN3",          type: "decimal5", width: 14 },
  { header: "Tarifa Nivel 4",          field: "tarifaN4",          type: "decimal5", width: 14 },
  { header: "Cfjm",                    field: "cfjm",              type: "decimal5", width: 12 },
  { header: "Fecha Publicación",       field: "fechaPublicacion",  type: "date",     width: 14 },
  { header: "Diario de Publicacion",   field: "diarioPublicacion", type: "string",   width: 20 },
  { header: "Tarifa OT",               field: "tarifaOT",          type: "int",      width: 10 },
];

export const T7_SPEC: SuiColumn<T7Row>[] = [
  { header: "city_code",     field: "cityCode",     type: "int",      width: 12 },
  { header: "level",         field: "level",        type: "string",   width: 8 },
  { header: "gm",            field: "gm",           type: "decimal5", width: 11 },
  { header: "tm",            field: "tm",           type: "decimal5", width: 11 },
  { header: "rm",            field: "rm",           type: "decimal5", width: 11 },
  { header: "dnm",           field: "dnm",          type: "decimal5", width: 11 },
  { header: "prnm",          field: "prnm",         type: "decimal5", width: 11 },
  { header: "cvm",           field: "cvm",          type: "decimal5", width: 11 },
  { header: "cuvm",          field: "cuvm",         type: "decimal5", width: 11 },
  { header: "cargo_horario", field: "cargoHorario", type: "int",      width: 13 },
];

/** T4 18 columnas = idéntico a T3 (spec observada en el archivo enviado al SUI). */
export const T4_SPEC_18: SuiColumn<T4Row>[] = T3_SPEC as unknown as SuiColumn<T4Row>[];

/** T4 20 columnas = T3 + Año/Mes Corregido como cols 2 y 3 (spec lineamientos). */
export const T4_SPEC_20: SuiColumn<T4Row>[] = [
  T3_SPEC[0]!, // city_code
  { header: "Año Corregido", field: "anioCorregido", type: "int", width: 12 } as SuiColumn<T4Row>,
  { header: "Mes Corregido", field: "mesCorregido", type: "int", width: 12 } as SuiColumn<T4Row>,
  ...(T3_SPEC.slice(1) as unknown as SuiColumn<T4Row>[]),
];

export const T8_SPEC_10: SuiColumn<T8Row>[] = T7_SPEC as unknown as SuiColumn<T8Row>[];

export const T8_SPEC_12: SuiColumn<T8Row>[] = [
  T7_SPEC[0]!,
  { header: "Año Corregido", field: "anioCorregido", type: "int", width: 12 } as SuiColumn<T8Row>,
  { header: "Mes Corregido", field: "mesCorregido", type: "int", width: 12 } as SuiColumn<T8Row>,
  ...(T7_SPEC.slice(1) as unknown as SuiColumn<T8Row>[]),
];
