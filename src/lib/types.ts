/**
 * Tipos compartidos del dominio SUI tarifario.
 * Diseñados para que el frontend (Lovable) consuma exactamente las mismas estructuras.
 */

/** Código de un nivel/propiedad tal como lo expresan los formatos SUI (T7/T8). */
export type LevelCode = "1-100" | "1-50" | "1-0" | "2" | "3";

/** Etiqueta legible que aparece en el reporte visual de origen. */
export type LevelLabel = "1 OR." | "1 Comp." | "1 US." | "2" | "3";

/**
 * Componentes del costo unitario (CU) que vienen en cada fila del reporte visual.
 *
 * NOTACIÓN INTERNA (campos en SourceRow):
 *   gm   – Costo de compra de energía         (col C del visual)
 *   tm   – Costo por uso del SNT              (global, col D2)
 *   rm   – Restricciones                      (global o per-row col E2)
 *   dnm  – Distribución                       (col F del visual)
 *   prLoss – Pérdidas reconocidas             (col D del visual — header dice "Cvm")
 *   cvmBase – Margen de comercialización base (col G del visual — header dice "PR nm")
 *   cvmCot  – Cvm + COT                       (col E del visual)
 *   cuvm    – CU sin COT                      (col H = gm+tm+rm+dnm+prLoss+cvmBase)
 *   cuPlusCot – CU + COT                      (col I = gm+tm+rm+dnm+cvmBase+cvmCot)
 *
 * Equivalencia con el T7/T8 que envía BIA al SUI (y que el SUI acepta):
 *   T7.gm   = source.gm
 *   T7.tm   = source.tm
 *   T7.rm   = source.rm
 *   T7.dnm  = source.dnm
 *   T7.prnm = source.cvmBase     ← ¡ojo! header T7 dice "prnm" pero almacena Cvm base
 *   T7.cvm  = source.cvmCot      ← header T7 dice "cvm" pero almacena Cvm+COT
 *   T7.cuvm = source.cuPlusCot   ← header T7 dice "cuvm" pero almacena CU+COT
 *
 * Esta peculiaridad es exactamente la "etiqueta cruzada" que el usuario advirtió:
 * los nombres de las columnas en T7 no se corresponden con la definición CREG
 * literal, pero es lo que el cargue masivo SUI tiene aceptando.
 */
export interface CUComponents {
  gm: number;
  tm: number;
  rm: number;
  dnm: number;
  /** Pérdidas reconocidas literales (col D source). Solo usado para validación. */
  prLoss: number;
  /** Margen comercialización base — equivale al T7.prnm en el archivo SUI. */
  cvmBase: number;
  /** Cvm + COT — equivale al T7.cvm en el archivo SUI. */
  cvmCot: number;
  /** CU sin COT — solo para validación de la identidad. */
  cuvm: number;
  /** CU + COT — equivale al T7.cuvm en el archivo SUI; es la Tarifa N1 bruta. */
  cuPlusCot: number;
}

/** Una fila de origen: un mercado × un nivel/propiedad. */
export interface SourceRow extends CUComponents {
  mercado: string;          // p.ej. "ANTIOQUIA"
  cfjm: number;             // Cfm.j que aparece en la cabecera del bloque
  level: LevelCode;         // 1-100 / 1-50 / 1-0 / 2 / 3
  levelLabel: LevelLabel;   // "1 OR." / "1 Comp." / "1 US." / "2" / "3"
  // Componentes adicionales del visual report
  resEstr1?: number;        // Tarifa residencial estrato 1 (Cu + Contribución/Subsidio)
  resEstr2?: number;
  resEstr3?: number;
}

/**
 * Snapshot completo de un Excel origen. Sirve para publicación y republicación;
 * en republicación solo trae el subconjunto de mercados afectados.
 */
export interface SourceWorkbook {
  /** Período del reporte ("Abril de 2026", "2026-04" si lo derivamos). */
  period: { year: number; month: number; label: string };
  /** Tm global (si el reporte lo expone fuera de la grilla; opcional). */
  tmGlobal?: number;
  /** Rm,i global por nivel (opcional). */
  rmGlobalByLevel?: Partial<Record<LevelCode, number>>;
  /** Si el archivo es una republicación. */
  isRepublication: boolean;
  /** Filas: una por mercado × nivel. */
  rows: SourceRow[];
  /** Mercados detectados (en orden de aparición). */
  mercados: string[];
  /** Diagnósticos del parser (advertencias, columnas inferidas, etc.). */
  diagnostics: ParseDiagnostic[];
}

export interface ParseDiagnostic {
  level: "info" | "warn" | "error";
  code: string;
  message: string;
  cellRef?: string;
  mercado?: string;
}

/* ───────────────────────────── T3 ───────────────────────────── */

export interface T3Row {
  cityCode: number;            // ID Mercado (DANE)
  cargoHorario: number;        // 4 = monomio (típico)
  inicioFranja: string;        // "00:00"
  finFranja: string;           // "23:59"
  estrato: number;             // 1..6 residencial, otros para sectores
  pctSub100: number;           // % subsidio para Nivel 1 100% OR
  pctSub50: number;
  pctSub0: number;
  tarifaN1_100: number;        // Tarifa Nivel 1 100% OR (= CU+COT de la fila 1-OR)
  tarifaN1_50: number;         // Tarifa Nivel 1 50% OR  (= CU+COT de la fila 1-Comp)
  tarifaN1_0: number;          // Tarifa Nivel 1 0%  OR  (= CU+COT de la fila 1-US)
  tarifaN2: number;
  tarifaN3: number;
  tarifaN4: number;            // 0 si el mercado no tiene N4
  cfjm: number;
  fechaPublicacion: Date;
  diarioPublicacion: string;   // p.ej. "El Nuevo Siglo"
  tarifaOT: number;            // 1 = sí (CREG 012/2020), 2 = no
}

/* ───────────────────────────── T7 ───────────────────────────── */

export interface T7Row {
  cityCode: number;
  level: LevelCode;
  gm: number;
  tm: number;
  rm: number;
  dnm: number;
  prnm: number;
  cvm: number;
  cuvm: number;        // CU base (sin COT)
  cargoHorario: number;
}

/* ───────────────────────────── T4 / T8 ───────────────────────────── */

/**
 * Spec real observada en archivos enviados al SUI: 18 columnas (sin
 * "Año Corregido" / "Mes Corregido"). Mantenemos opcionales por compatibilidad
 * con la spec descrita en los lineamientos (20 cols).
 */
export interface T4Row extends T3Row {
  anioCorregido?: number;
  mesCorregido?: number;
}

export interface T8Row extends T7Row {
  anioCorregido?: number;
  mesCorregido?: number;
}

/* ───────────────────────────── Comparación ───────────────────────────── */

export interface Difference {
  format: "T3" | "T4" | "T7" | "T8";
  rowKey: string;          // p.ej. "cityCode=704|level=1-100" o "cityCode=704|estrato=4"
  field: string;
  provisional: unknown;
  reconstructed: unknown;
  /** Tolerancia (numérica) aplicada al comparar; si la diff la supera. */
  delta?: number;
  severity: "info" | "warn" | "error";
}

export interface ValidationReport {
  format: "T3" | "T4" | "T7" | "T8" | "SOURCE";
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  ref?: string;        // celda, fila, mercado
}
