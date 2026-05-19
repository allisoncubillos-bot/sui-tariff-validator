/**
 * Tipos compartidos del dominio SUI tarifario.
 */

/** Etiquetas de nivel/propiedad tal como aparecen en el reporte visual (origen). */
export type LevelLabel = "1 OR." | "1 Comp." | "1 US." | "2" | "3";

/** Códigos canónicos usados en T7/T8 (SUI). */
export type LevelCode = "1-100" | "1-50" | "1-0" | "2" | "3";

/** Componentes tarifarios del CU. */
export type Componente = "Gm" | "Tm" | "Rm" | "Dnm" | "PRnm" | "Cvm";

/* ───────────── SOURCE (reporte visual) ───────────── */

export interface SourceRow {
  mercado: string;
  level: LevelCode;
  /** Etiqueta de nivel original tal como apareció en el reporte. */
  levelLabel?: LevelLabel;
  gm: number;
  tm: number;
  rm: number;
  dnm: number;
  /** Pérdidas (PR_nm) — valor base sin COT. */
  prLoss: number;
  /** Cvm base (sin COT). */
  cvmBase: number;
  /** Cvm + COT. */
  cvmCot: number;
  /** CU base (sin COT). */
  cuvm: number;
  /** CU + COT (= Tarifa N1 sin subsidio). */
  cuPlusCot: number;
  /** Cfm.j del bloque del mercado. */
  cfjm: number;
  /** Tarifas residenciales con subsidio (estratos 1-3) si vienen en el reporte. */
  resEstr1?: number;
  resEstr2?: number;
  resEstr3?: number;
}

export interface SourceWorkbook {
  /** Lista de mercados detectados (en orden de aparición). */
  mercados: string[];
  rows: SourceRow[];
  diagnostics?: ParseDiagnostic[];
  /** Período del reporte (ej: "2026-04") si pudo detectarse. */
  period?: { year: number; month: number; label: string };
  /** Tm global detectado (publicación). */
  tmGlobal?: number;
  /** Marca true si proviene del parser de republicación. */
  isRepublication?: boolean;
  [key: string]: unknown;
}

/* ───────────── Formatos SUI ───────────── */

export interface T3Row {
  cityCode: number;
  cargoHorario: number;
  inicioFranja: string;
  finFranja: string;
  estrato: number;
  pctSub100: number;
  pctSub50: number;
  pctSub0: number;
  tarifaN1_100: number;
  tarifaN1_50: number;
  tarifaN1_0: number;
  tarifaN2: number;
  tarifaN3: number;
  tarifaN4: number;
  cfjm: number;
  fechaPublicacion: Date;
  diarioPublicacion: string;
  tarifaOT: number;
}

export interface T4Row extends T3Row {
  anioCorregido?: number;
  mesCorregido?: number;
}

export interface T7Row {
  cityCode: number;
  level: LevelCode;
  gm: number;
  tm: number;
  rm: number;
  dnm: number;
  prnm: number;
  cvm: number;
  cuvm: number;
  cargoHorario: number;
}

export interface T8Row extends T7Row {
  anioCorregido?: number;
  mesCorregido?: number;
}

/* ───────────── T9 (Variables Costo Unitario CU 119 - UR) ───────────── */

/**
 * Una fila por mercado de comercialización. Los 54 campos siguen el orden y
 * nombres del FORMATO T9 (Lineamientos SSPD).
 *
 * Algunos valores son por-mercado (vienen de la memoria de cálculo o de
 * tablas hardcodeadas), otros son globales constantes (w, %CREG, %SSPD,
 * Balance Subsidios, Actividad), otros derivan del período (AÑO, TRIM, MG
 * TRIM), y otros se calculan a partir de matrices horarias agregadas
 * (CB MNR, VCB MNR).
 */
export interface T9Row {
  /** 1. ID Mercado (city_code DANE). */
  idMercado: number;
  /** 2. ECC — Energía Compras en Contratos (kWh). */
  ecc: number;
  /** 3. VECC — Valor Compras en Contratos ($). */
  vecc: number;
  /** 4. AECC — Ajuste Energía Compra Contratos. */
  aecc: number;
  /** 5. AVECC — Ajuste Valor Energía Comprada en Contratos. */
  avecc: number;
  /** 6. AMC — Ajuste a Mc ($/kWh). */
  amc: number;
  /** 7. CB MR — Compras en Bolsa MR (kWh). */
  cbMr: number;
  /** 8. VCB MR — Valor Compras en Bolsa MR ($). */
  vcbMr: number;
  /** 9. ACB MR — Ajuste Compras en Bolsa MR. */
  acbMr: number;
  /** 10. AVCB MR — Ajuste Valor Compras en Bolsa MR. */
  avcbMr: number;
  /** 11. CB MNR — Compras en Bolsa No Regulado (kWh). Suma matriz cantidades. */
  cbMnr: number;
  /** 12. VCB MNR — Valor Compras en Bolsa No Regulado ($). Suma (precio*cantidad). */
  vcbMnr: number;
  /** 13. AGPE. */
  agpe: number;
  /** 14. GD. */
  gd: number;
  /** 15. GTr — G Transitorio ($/kWh). */
  gTr: number;
  /** 16. CUG. */
  cug: number;
  /** 17. CLP. */
  clp: number;
  /** 18. ACLP. */
  aclp: number;
  /** 19. w — ponderador precios contratos bilaterales. */
  w: number;
  /** 20. PSA — precio ponderado contratos largo plazo. */
  psa: number;
  /** 21. EGP. */
  egp: number;
  /** 22. ADm — saldo acumulado diferencias CR vs Gm. */
  aDm: number;
  /** 23. VRm-1 — ventas mercado regulado mes m-1 (kWh). */
  vrMMinus1: number;
  /** 24. i — tasa de interés. */
  i: number;
  /** 25. AJ — factor de ajuste ($/kWh). */
  aj: number;
  /** 26. Alfa — α del Comercializador Minorista en el mercado. */
  alfa: number;
  /** 27. DCR AGPE. */
  dcrAgpe: number;
  /** 28. ADMRE G. */
  admreG: number;
  /** 29. APRRE G. */
  aprreG: number;
  /** 30. ADR IPRSTN. */
  adrIprstn: number;
  /** 31. APR IPRSTN. */
  aprIprstn: number;
  /** 32. AREST. */
  arest: number;
  /** 33. Cfj — costo base de comercialización ($/factura). Hardcoded por mercado. */
  cfj: number;
  /** 34. RCT — prima riesgo cartera tradicional. Hardcoded por mercado. */
  rct: number;
  /** 35. RCAE — prima riesgo cartera áreas especiales. Hardcoded por mercado. */
  rcae: number;
  /** 36. IFSSRI. */
  ifssri: number;
  /** 37. IFOES. */
  ifoes: number;
  /** 38. Balance Subsidios (1=Deficitario, 2=Superavitario). */
  balanceSubsidios: number;
  /** 39. AÑO. */
  anio: number;
  /** 40. TRIM (1..4). */
  trim: number;
  /** 41. MG TRIM — mes dentro del trimestre (1..3). */
  mgTrim: number;
  /** 42. Sub1. */
  sub1: number;
  /** 43. Sub2. */
  sub2: number;
  /** 44. N. */
  n: number;
  /** 45. M. */
  m: number;
  /** 46. r1. */
  r1: number;
  /** 47. r2. */
  r2: number;
  /** 48. Facturación. */
  facturacion: number;
  /** 49. Actividad (1=Comercializador Puro, 2=Comercializador Integrado). */
  actividad: number;
  /** 50. %CREG. */
  pctCreg: number;
  /** 51. %SSPD. */
  pctSspd: number;
  /** 52. CREG ($) — contribución pagada a CREG. Input anual. */
  cregPesos: number;
  /** 53. SSPD ($) — contribución pagada a SSPD. Input anual. */
  sspdPesos: number;
  /** 54. PUI. */
  pui: number;
}

/* ───────────── Diagnóstico / validación ───────────── */

export type DiagnosticLevel = "info" | "warn" | "error";

export interface ParseDiagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  ref?: string;
  /** Celda específica donde se detectó (ej: "B12"). */
  cellRef?: string;
  /** Mercado relacionado, si aplica. */
  mercado?: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  ref?: string;
}

export interface ValidationReport {
  format: "T3" | "T4" | "T7" | "T8" | "SOURCE";
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

export interface Difference {
  format: "T3" | "T4" | "T7" | "T8";
  rowKey: string;
  field: string;
  provisional: unknown;
  reconstructed: unknown;
  delta?: number;
  severity: "info" | "warn" | "error";
}
