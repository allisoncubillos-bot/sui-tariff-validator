/**
 * Definición declarativa de cada formato SUI.
 * El exportador la consume para escribir las columnas en el orden correcto,
 * aplicar tipos y formato (5 decimales obligatorios para valores tarifarios).
 *
 * Mantener esta única fuente de verdad evita que `generators` y `exporters`
 * se desincronicen entre sí. Si el SUI cambia un formato, se ajusta SOLO aquí.
 */

import type { T3Row, T4Row, T7Row, T8Row, T9Row } from "../types.js";

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

/**
 * T9 — Variables Costo Unitario de Prestación del Servicio CU 119 – UR.
 * 54 columnas, una fila por mercado de comercialización.
 *
 * Headers exactos según el "Formato base T9.csv" provisto por el equipo de
 * regulación. El SUI valida los nombres de columna — no modificar la cadena
 * del header sin verificar el rechazo del validador SUI.
 */
export const T9_SPEC: SuiColumn<T9Row>[] = [
  { header: "ID Mercado",        field: "idMercado",        type: "int",      width: 11 },
  { header: "ECC",               field: "ecc",              type: "decimal5", width: 16 },
  { header: "VECC",              field: "vecc",             type: "decimal5", width: 18 },
  { header: "AECC",              field: "aecc",             type: "decimal5", width: 10 },
  { header: "AVECC",             field: "avecc",            type: "decimal5", width: 10 },
  { header: "AMC",               field: "amc",              type: "decimal5", width: 12 },
  { header: "CB MR",             field: "cbMr",             type: "decimal5", width: 16 },
  { header: "VCB MR",            field: "vcbMr",            type: "decimal5", width: 18 },
  { header: "ACB MR",            field: "acbMr",            type: "decimal5", width: 10 },
  { header: "AVCB MR",           field: "avcbMr",           type: "decimal5", width: 10 },
  { header: "CB MNR",            field: "cbMnr",            type: "decimal5", width: 16 },
  { header: "VCB MNR",           field: "vcbMnr",           type: "decimal5", width: 18 },
  { header: "AGPE",              field: "agpe",             type: "decimal5", width: 12 },
  { header: "GD",                field: "gd",               type: "decimal5", width: 10 },
  { header: "GTr",               field: "gTr",              type: "decimal5", width: 12 },
  { header: "CUG",               field: "cug",              type: "decimal5", width: 10 },
  { header: "CLP",               field: "clp",              type: "decimal5", width: 10 },
  { header: "ACLP",              field: "aclp",             type: "decimal5", width: 10 },
  { header: "w",                 field: "w",                type: "decimal5", width: 8  },
  { header: "PSA",               field: "psa",              type: "decimal5", width: 10 },
  { header: "EGP",               field: "egp",              type: "decimal5", width: 10 },
  { header: "Adm",               field: "aDm",              type: "decimal5", width: 18 },
  { header: "VRm-1",             field: "vrMMinus1",        type: "decimal5", width: 18 },
  { header: "i",                 field: "i",                type: "decimal5", width: 10 },
  { header: "AJ",                field: "aj",               type: "decimal5", width: 12 },
  { header: "alfa",              field: "alfa",             type: "decimal5", width: 10 },
  { header: "DCR AGPE",          field: "dcrAgpe",          type: "decimal5", width: 10 },
  { header: "ADMRE G",           field: "admreG",           type: "decimal5", width: 10 },
  { header: "APRRE G",           field: "aprreG",           type: "decimal5", width: 10 },
  { header: "ADR IPRSTN",        field: "adrIprstn",        type: "decimal5", width: 10 },
  { header: "APR IPRSTN",        field: "aprIprstn",        type: "decimal5", width: 10 },
  { header: "AREST",             field: "arest",            type: "decimal5", width: 10 },
  { header: "CfJ",               field: "cfj",              type: "decimal5", width: 12 },
  { header: "RCT",               field: "rct",              type: "decimal5", width: 12 },
  { header: "RCAE",              field: "rcae",             type: "decimal5", width: 12 },
  { header: "IFSSRI",            field: "ifssri",           type: "decimal5", width: 10 },
  { header: "IFOES",             field: "ifoes",            type: "decimal5", width: 10 },
  { header: "Balance Subsidios", field: "balanceSubsidios", type: "int",      width: 16 },
  { header: "AÑO",               field: "anio",             type: "int",      width: 8  },
  { header: "TRIM",              field: "trim",             type: "int",      width: 8  },
  { header: "MG TRIM",           field: "mgTrim",           type: "int",      width: 8  },
  { header: "Sub1",              field: "sub1",             type: "decimal5", width: 10 },
  { header: "Sub2",              field: "sub2",             type: "decimal5", width: 10 },
  { header: "N",                 field: "n",                type: "decimal5", width: 8  },
  { header: "M",                 field: "m",                type: "decimal5", width: 8  },
  { header: "r1",                field: "r1",               type: "decimal5", width: 8  },
  { header: "r2",                field: "r2",               type: "decimal5", width: 8  },
  { header: "Facturacion",       field: "facturacion",      type: "decimal5", width: 14 },
  { header: "Actividad",         field: "actividad",        type: "int",      width: 11 },
  { header: "%CREG",             field: "pctCreg",          type: "decimal5", width: 10 },
  { header: "%SSPD",             field: "pctSspd",          type: "decimal5", width: 10 },
  { header: "CREG ($)",          field: "cregPesos",        type: "decimal5", width: 14 },
  { header: "SSPD ($)",          field: "sspdPesos",        type: "decimal5", width: 14 },
  { header: "PUI",               field: "pui",              type: "decimal5", width: 10 },
];
