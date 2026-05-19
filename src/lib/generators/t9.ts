/**
 * Generador del FORMATO T9 — Variables Costo Unitario de Prestación del
 * Servicio CU 119 – UR.
 *
 * Emite una T9Row por mercado activo (20 mercados de BIA Energy). Las fuentes
 * de cada campo:
 *
 *   - Memoria de cálculo (long format city × component × type_term → value):
 *       ECC, PricingContracts, McAdjustment, QuantityStocks, PricingStocks,
 *       TotalGTransitional, AccumulatedBalance, SalesLastMonth, InterestRate,
 *       AdjustmentFactor, Alpha
 *
 *   - Matrices XM agregadas:
 *       CB MNR  = Σ cantidad compras bolsa no regulado (kWh)
 *       VCB MNR = Σ precio bolsa × cantidad compras bolsa no regulado ($)
 *
 *   - Hardcoded por mercado (T9_MERCADO_CONSTANTS):
 *       CfJ, RCT, RCAE
 *
 *   - Globales constantes (T9_GLOBAL): los 0 y los fijos (w=1, %CREG=100…)
 *
 *   - Derivados del período seleccionado:
 *       AÑO, TRIM, MG TRIM
 *
 *   - Input anual del usuario (UI):
 *       CREG ($), SSPD ($)
 */

import type { T9Row, ParseDiagnostic } from "../types.js";
import {
  T9_GLOBAL,
  T9_CITY_ORDER,
  getT9MercadoConstants,
} from "../domain/t9-constants.js";
import { type MemoriaWorkbook, lookup } from "../parsers/memoria-calculo.js";
import type { AggregatedBolsa } from "../parsers/matrices-bolsa.js";

export interface GenerateT9Options {
  /** Año del período de reporte (= año del start_date de la memoria). */
  year: number;
  /** Mes 1..12 del período de reporte. */
  month: number;
  /**
   * Contribución pagada a CREG durante el año t (campo 52). Fallback —
   * si la memoria trae `CommercializationTerms·ContributionsCreg`, ese
   * valor (÷12, redondeado a 2 decimales) tiene prioridad.
   */
  cregPesos: number;
  /**
   * Contribución pagada a SSPD durante el año t (campo 53). Mismo fallback
   * que cregPesos pero con `ContributionsSspd`.
   */
  sspdPesos: number;
  /**
   * Subconjunto de mercados a emitir. Si no se pasa, se usan los 20 de
   * T9_CITY_ORDER. Útil para republicaciones parciales.
   */
  cityCodes?: number[];
}

/** Redondea a 2 decimales (CREG/SSPD se reportan en pesos con centavos). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface T9GeneratorResult {
  rows: T9Row[];
  diagnostics: ParseDiagnostic[];
}

/** Devuelve trimestre (1..4) y mes-del-trimestre (1..3) de un mes 1..12. */
function trimAndMonthOfTrim(month: number): { trim: number; mgTrim: number } {
  const trim = Math.ceil(month / 3);
  const mgTrim = ((month - 1) % 3) + 1;
  return { trim, mgTrim };
}

export function generateT9(
  memoria: MemoriaWorkbook,
  bolsa: AggregatedBolsa,
  opts: GenerateT9Options,
): T9GeneratorResult {
  const diagnostics: ParseDiagnostic[] = [];
  const { trim, mgTrim } = trimAndMonthOfTrim(opts.month);
  const cityCodes = opts.cityCodes ?? T9_CITY_ORDER;
  const rows: T9Row[] = [];

  // Resolver CREG ($) y SSPD ($) — si la memoria trae los valores anuales,
  // calcular mensual = anual / 12 redondeado a 2 decimales. Si no, usar el
  // input del usuario (opts.cregPesos / opts.sspdPesos).
  //
  // Las contribuciones son globales (mismo valor para los 20 mercados); las
  // leemos del primer mercado disponible en la memoria.
  let resolvedCreg = opts.cregPesos;
  let resolvedSspd = opts.sspdPesos;
  const firstCity = cityCodes.find((c) => memoria.index.has(c)) ?? cityCodes[0]!;
  const annualCreg = lookup(memoria, firstCity, "CommercializationTerms", "ContributionsCreg");
  const annualSspd = lookup(memoria, firstCity, "CommercializationTerms", "ContributionsSspd");
  if (annualCreg > 0) {
    resolvedCreg = round2(annualCreg / 12);
    diagnostics.push({
      level: "info",
      code: "t9.cregFromMemoria",
      message: `CREG ($) calculado desde memoria: ContributionsCreg=${annualCreg} ÷ 12 = ${resolvedCreg}`,
    });
  }
  if (annualSspd > 0) {
    resolvedSspd = round2(annualSspd / 12);
    diagnostics.push({
      level: "info",
      code: "t9.sspdFromMemoria",
      message: `SSPD ($) calculado desde memoria: ContributionsSspd=${annualSspd} ÷ 12 = ${resolvedSspd}`,
    });
  }
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.log(`[t9:generate] CREG=${resolvedCreg} (annual=${annualCreg}), SSPD=${resolvedSspd} (annual=${annualSspd})`);
  }

  for (const cityCode of cityCodes) {
    const mc = getT9MercadoConstants(cityCode);
    if (!mc) {
      diagnostics.push({
        level: "warn",
        code: "t9.unknownCity",
        message: `cityCode ${cityCode} no tiene constantes T9 (CfJ/RCT/RCAE) — fila omitida.`,
      });
      continue;
    }

    if (!memoria.index.has(cityCode)) {
      diagnostics.push({
        level: "warn",
        code: "t9.noMemoriaData",
        message: `cityCode ${cityCode} ausente en la memoria de cálculo — se emite fila con campos memoria=0.`,
      });
    }

    // ── Lookups en la memoria ──────────────────────────────────────────────
    // Cada constante viene de un (component, type_term) específico. El helper
    // `lookup` devuelve 0 si la combinación no existe. NO hardcodear ninguno
    // de estos a 0 — todos DEBEN provenir de la memoria.
    const quantityContracts = lookup(memoria, cityCode, "GenerationTerms", "QuantityContracts");
    const pricingContracts  = lookup(memoria, cityCode, "GenerationTerms", "PricingContracts");
    // AMC (campo 6 del T9) = ajuste a la variable Mc — viene SIEMPRE de la
    // memoria, jamás hardcoded. Si sale 0, es porque la memoria trae 0 o
    // porque el (component, type_term) no se encontró (revisar
    // diagnostics).
    const mcAdjustment      = lookup(memoria, cityCode, "GenerationTerms", "McAdjustment");
    const quantityStocks    = lookup(memoria, cityCode, "GenerationTerms", "QuantityStocks");
    const pricingStocks     = lookup(memoria, cityCode, "GenerationTerms", "PricingStocks");
    const totalGTransitional = lookup(memoria, cityCode, "AgpeTerms", "TotalGTransitional");
    const accumulatedBalance = lookup(memoria, cityCode, "AjTerms", "AccumulatedBalance");
    const salesLastMonth     = lookup(memoria, cityCode, "CommercializationTerms", "SalesLastMonth");
    const interestRate       = lookup(memoria, cityCode, "AjTerms", "InterestRate");
    const adjustmentFactor   = lookup(memoria, cityCode, "AjTerms", "AdjustmentFactor");
    const alpha              = lookup(memoria, cityCode, "GenerationTerms", "Alpha");

    if (cityCode === firstCity && typeof console !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(`[t9:generate] sample mercado ${cityCode}: ECC=${quantityContracts}, AMC=${mcAdjustment}, AGPE=${totalGTransitional}, Alpha=${alpha}`);
    }

    rows.push({
      idMercado: cityCode,
      ecc: quantityContracts,
      vecc: quantityContracts * pricingContracts,
      aecc: T9_GLOBAL.aecc,
      avecc: T9_GLOBAL.avecc,
      amc: mcAdjustment,
      cbMr: quantityStocks,
      vcbMr: pricingStocks,
      acbMr: T9_GLOBAL.acbMr,
      avcbMr: T9_GLOBAL.avcbMr,
      cbMnr: bolsa.cbMnr,
      vcbMnr: bolsa.vcbMnr,
      agpe: totalGTransitional,
      gd: T9_GLOBAL.gd,
      gTr: totalGTransitional,
      cug: T9_GLOBAL.cug,
      clp: T9_GLOBAL.clp,
      aclp: T9_GLOBAL.aclp,
      w: T9_GLOBAL.w,
      psa: T9_GLOBAL.psa,
      egp: T9_GLOBAL.egp,
      aDm: accumulatedBalance,
      vrMMinus1: salesLastMonth,
      i: interestRate,
      aj: adjustmentFactor,
      alfa: alpha,
      dcrAgpe: T9_GLOBAL.dcrAgpe,
      admreG: T9_GLOBAL.admreG,
      aprreG: T9_GLOBAL.aprreG,
      adrIprstn: T9_GLOBAL.adrIprstn,
      aprIprstn: T9_GLOBAL.aprIprstn,
      arest: T9_GLOBAL.arest,
      cfj: mc.cfj,
      rct: mc.rct,
      rcae: mc.rcae,
      ifssri: T9_GLOBAL.ifssri,
      ifoes: T9_GLOBAL.ifoes,
      balanceSubsidios: T9_GLOBAL.balanceSubsidios,
      anio: opts.year,
      trim,
      mgTrim,
      sub1: T9_GLOBAL.sub1,
      sub2: T9_GLOBAL.sub2,
      n: T9_GLOBAL.n,
      m: T9_GLOBAL.m,
      r1: T9_GLOBAL.r1,
      r2: T9_GLOBAL.r2,
      facturacion: T9_GLOBAL.facturacion,
      actividad: T9_GLOBAL.actividad,
      pctCreg: T9_GLOBAL.pctCreg,
      pctSspd: T9_GLOBAL.pctSspd,
      cregPesos: resolvedCreg,
      sspdPesos: resolvedSspd,
      pui: T9_GLOBAL.pui,
    });
  }

  return { rows, diagnostics };
}
