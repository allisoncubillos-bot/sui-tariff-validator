/**
 * Constantes del formato T9 — valores fijos hardcoded para BIA Energy.
 *
 * Tres bloques:
 *   1. CFJ / RCT / RCAE por mercado — son aprobados por la CREG y no cambian
 *      mes a mes (a lo sumo se ajustan anualmente con la inflación cuando la
 *      CREG publica el ajuste).
 *   2. Constantes globales — valores que el SUI exige iguales para todos los
 *      mercados (w=1, Balance Subsidios=2 Superavitario, Actividad=1
 *      Comercializador Puro, %CREG=%SSPD=100).
 *   3. Defaults CREG($) / SSPD($) por año — input anual del usuario. Si el
 *      mes seleccionado es enero o no hay valor para el año, la UI exige
 *      actualización.
 *
 * Fuente: extraído del "Formato base T9.csv" provisto por el equipo de
 * regulación (calibrado contra el T9 enviado al SUI en 2026-Q1).
 */

import { MERCADOS } from "./mercados.js";

export interface T9MercadoConstants {
  cityCode: number;
  /** Costo base de comercialización ($/factura). Campo 33 del T9. */
  cfj: number;
  /** Prima riesgo de cartera tradicional. Campo 34 del T9. */
  rct: number;
  /** Prima riesgo cartera áreas especiales. Campo 35 del T9. */
  rcae: number;
}

/**
 * Valores por mercado (CfJ, RCT, RCAE). Aprobados por la CREG.
 *
 * Para agregar/quitar un mercado: editar acá y validar que el cityCode esté
 * presente en MERCADOS (domain/mercados.ts).
 */
export const T9_MERCADO_CONSTANTS: T9MercadoConstants[] = [
  { cityCode: 704, cfj: 4891.15, rct: 0.00047, rcae: 0.00000 }, // ANTIOQUIA
  { cityCode: 176, cfj: 5549.92, rct: 0.00228, rcae: 0.00000 }, // BOGOTÁ
  { cityCode: 158, cfj: 8296.00, rct: 0.00333, rcae: 0.01000 }, // BOYACÁ
  { cityCode: 162, cfj: 6477.30, rct: 0.00067, rcae: 0.00000 }, // CALDAS
  { cityCode: 165, cfj: 5119.00, rct: 0.00036, rcae: 0.04379 }, // CALI
  { cityCode: 443, cfj: 8575.50, rct: 0.00059, rcae: 0.17820 }, // CARIBE MAR
  { cityCode: 444, cfj: 8575.50, rct: 0.00059, rcae: 0.17820 }, // CARIBE SOL
  { cityCode: 168, cfj: 5172.84, rct: 0.00258, rcae: 0.00000 }, // CARTAGO
  { cityCode: 703, cfj: 6162.51, rct: 0.00066, rcae: 0.02340 }, // CASANARE
  { cityCode: 172, cfj: 7065.00, rct: 0.00510, rcae: 0.00510 }, // CAUCA
  { cityCode: 170, cfj: 8522.00, rct: 0.00491, rcae: 0.01135 }, // HUILA
  { cityCode: 175, cfj: 6714.00, rct: 0.00082, rcae: 0.00000 }, // META
  { cityCode: 173, cfj: 6888.90, rct: 0.00615, rcae: 0.07630 }, // NARIÑO
  { cityCode: 161, cfj: 6261.90, rct: 0.00035, rcae: 0.00120 }, // NORTE SANTANDER
  { cityCode: 163, cfj: 7533.20, rct: 0.00080, rcae: 0.00000 }, // PEREIRA
  { cityCode: 164, cfj: 6537.00, rct: 0.00080, rcae: 0.00000 }, // QUINDÍO
  { cityCode: 160, cfj: 5414.88, rct: 0.00377, rcae: 0.04050 }, // SANTANDER
  { cityCode: 169, cfj: 5734.42, rct: 0.00073, rcae: 0.06060 }, // TOLIMA
  { cityCode: 166, cfj: 6095.00, rct: 0.00045, rcae: 0.00000 }, // TULUA
  { cityCode: 561, cfj: 9139.00, rct: 0.00114, rcae: 0.63430 }, // VALLE
];

const byCity = new Map<number, T9MercadoConstants>(
  T9_MERCADO_CONSTANTS.map((m) => [m.cityCode, m]),
);

export function getT9MercadoConstants(cityCode: number): T9MercadoConstants | undefined {
  return byCity.get(cityCode);
}

/**
 * Orden canónico de filas en el output T9 — sigue el orden del MERCADOS
 * catálogo (= orden alfabético del nombre del mercado), idéntico al
 * "Formato base T9.csv" provisto.
 */
export const T9_CITY_ORDER: number[] = MERCADOS.map((m) => m.cityCode);

/* ──────────── Constantes globales (mismas para todos los mercados) ──────── */

export const T9_GLOBAL = {
  /** Campo 4 — AECC siempre 0 (no hay ajustes de versión TXR/TXP en T9 base). */
  aecc: 0,
  /** Campo 5 — AVECC siempre 0. */
  avecc: 0,
  /** Campo 9 — ACB MR siempre 0. */
  acbMr: 0,
  /** Campo 10 — AVCB MR siempre 0. */
  avcbMr: 0,
  /** Campo 14 — GD siempre 0 en BIA (no hay GD propio, solo AGPE). */
  gd: 0,
  /** Campo 16 — CUG siempre 0 (BIA no participa en subasta MME largo plazo). */
  cug: 0,
  /** Campo 17 — CLP siempre 0. */
  clp: 0,
  /** Campo 18 — ACLP siempre 0. */
  aclp: 0,
  /** Campo 19 — w siempre 1 (ponderador único). */
  w: 1,
  /** Campo 20 — PSA siempre 0 (sin contratos MME). */
  psa: 0,
  /** Campo 21 — EGP siempre 0. */
  egp: 0,
  /** Campos 27..32 — ajustes a IPRSTN/restricciones, 0 en publicación TXF. */
  dcrAgpe: 0,
  admreG: 0,
  aprreG: 0,
  adrIprstn: 0,
  aprIprstn: 0,
  arest: 0,
  /** Campo 36 — IFSSRI: BIA no tiene usuarios subsidiados FSSRI → 0. */
  ifssri: 0,
  /** Campo 37 — IFOES: BIA no tiene usuarios barrios subnormales → 0. */
  ifoes: 0,
  /** Campo 38 — Balance Subsidios: BIA es siempre Superavitario (=2). */
  balanceSubsidios: 2,
  /** Campos 42..47 — Subsidios, todos 0 al ser superavitario. */
  sub1: 0,
  sub2: 0,
  n: 0,
  m: 0,
  r1: 0,
  r2: 0,
  /** Campo 48 — Facturación: 0 (se reporta en TC2, no en T9). */
  facturacion: 0,
  /** Campo 49 — Actividad: 1 = Comercializador Puro. */
  actividad: 1,
  /** Campo 50 — %CREG: 100% se recupera por comercialización. */
  pctCreg: 100,
  /** Campo 51 — %SSPD: 100% se recupera por comercialización. */
  pctSspd: 100,
  /** Campo 54 — PUI: 0 hasta que la CREG implemente la resolución correspondiente. */
  pui: 0,
} as const;

/* ──────────── Defaults de CREG($) / SSPD($) por año ──────────── */

/**
 * Valores anuales por defecto de CREG ($) y SSPD ($). Si el año no está
 * presente, la UI le pide al usuario que ingrese los valores.
 *
 * Cuando el SUI publique los valores oficiales del año, agregarlos acá y
 * la UI los precargará automáticamente.
 */
export interface T9YearlyContributions {
  cregPesos: number;
  sspdPesos: number;
}

export const T9_YEARLY_CONTRIBUTIONS: Record<number, T9YearlyContributions> = {
  // Sin valores conocidos al momento de implementar — la UI pide al usuario.
};

/** Clave localStorage para persistir CREG/SSPD por año entre sesiones. */
export const T9_LS_PREFIX = "bia.t9.contrib.";
