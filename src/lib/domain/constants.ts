/** Precisión de salida obligatoria para todos los valores tarifarios. */
export const DECIMALS = 5;

/**
 * Tolerancia de comparación numérica (Excel guarda con flotantes IEEE-754;
 * el SUI valida con 5 decimales, así que 1e-4 es seguro).
 */
export const NUMERIC_TOLERANCE = 1e-4;

/**
 * Mínimo de filas esperadas en el T3 por mercado (Estratos 1–6 + sectores).
 * BIA Energy hoy publica ~5 filas/mercado × 21 mercados = 105 filas.
 */
export const T3_MIN_ROWS_PER_MERCADO = 1;

/** Códigos numéricos del campo Cargo Horario en T3/T7. */
export const CARGO_HORARIO = {
  MAXIMA: 1,
  MEDIA: 2,
  MINIMA: 3,
  MONOMIO: 4,
} as const;

export const FRANJA_DEFAULT = { inicio: "00:00", fin: "23:59" } as const;

/** Tarifa OT (CREG 012/2020): 1 = aplica OT, 2 = no aplica. */
export const TARIFA_OT = { SI: 1, NO: 2 } as const;
