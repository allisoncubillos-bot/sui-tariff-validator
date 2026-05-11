/**
 * Validador matemático: confirma identidades del modelo CREG.
 *
 *   1) En T7 / SourceRow:  CU = Gm + Tm + Rm + Dm + PR + Cvm  ± tolerancia
 *   2) En T3:              Tarifa N1 100% = CU+COT del nivel 1 OR (sin subsidio aplicado)
 *                          Si %sub > 0: Tarifa = CU+COT × (1 − %sub/100)
 *   3) Niveles consistentes: Tarifa N1 100% ≥ Tarifa N1 50% ≥ Tarifa N1 0%
 *                            (porque más participación del OR significa mayor costo
 *                             trasladado al usuario)
 *   4) Tarifa N1_0 ≥ Tarifa N2 ≥ Tarifa N3   (a mayor nivel, menor costo unitario)
 *   5) Cfjm > 0 y constante por mercado.
 */

import type { T3Row, T7Row, SourceRow, ValidationReport, ValidationIssue } from "../types.js";
import { NUMERIC_TOLERANCE } from "../domain/constants.js";

export function validateT7Math(rows: T7Row[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  for (const r of rows) {
    // Recordá: en BIA, T7.prnm = Cvm base y T7.cvm = Cvm+COT, y T7.cuvm = CU+COT.
    // Por eso esta sí cierra como identidad en el T7 que se envía al SUI.
    const sum = r.gm + r.tm + r.rm + r.dnm + r.prnm + r.cvm;
    const diff = Math.abs(sum - r.cuvm);
    if (diff > NUMERIC_TOLERANCE * 100) {
      errors.push({
        code: "T7_CU_SUM",
        message: `city=${r.cityCode} nivel=${r.level}: Gm+Tm+Rm+Dm+PR+Cvm=${sum.toFixed(5)} ≠ CUvm=${r.cuvm.toFixed(5)} (Δ=${diff.toFixed(5)})`,
        ref: `${r.cityCode}/${r.level}`,
      });
    }
  }
  return { format: "T7", passed: errors.length === 0, errors, warnings, info };
}

export function validateSourceMath(rows: SourceRow[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  for (const r of rows) {
    const sum = r.gm + r.tm + r.rm + r.dnm + r.prLoss + r.cvmBase;
    if (Math.abs(sum - r.cuvm) > NUMERIC_TOLERANCE * 100) {
      errors.push({
        code: "SOURCE_CU_SUM",
        message: `${r.mercado}/${r.level}: Gm+Tm+Rm+Dm+PR+Cvm=${sum.toFixed(5)} ≠ CU=${r.cuvm.toFixed(5)}`,
        ref: `${r.mercado}/${r.level}`,
      });
    }
    if (r.cuPlusCot < r.cuvm) {
      warnings.push({
        code: "COT_NEGATIVE",
        message: `${r.mercado}/${r.level}: CU+COT (${r.cuPlusCot}) < CU (${r.cuvm}) — COT no debería ser negativo.`,
        ref: `${r.mercado}/${r.level}`,
      });
    }
  }
  return { format: "SOURCE", passed: errors.length === 0, errors, warnings, info };
}

export function validateT3Consistency(rows: T3Row[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  const cfjmByCity = new Map<number, number>();
  for (const r of rows) {
    // Cfjm constante por mercado
    const prev = cfjmByCity.get(r.cityCode);
    if (prev != null && Math.abs(prev - r.cfjm) > NUMERIC_TOLERANCE) {
      errors.push({
        code: "T3_CFJM_INCONSISTENT",
        message: `city=${r.cityCode} estrato=${r.estrato}: Cfjm=${r.cfjm} ≠ Cfjm previo del mercado=${prev}`,
      });
    }
    cfjmByCity.set(r.cityCode, r.cfjm);

    // Orden esperado de tarifas — ojo, solo si %sub son iguales entre niveles.
    if (r.pctSub100 === r.pctSub50 && r.pctSub50 === r.pctSub0) {
      // Tarifa N1_100 ≥ Tarifa N1_50 ≥ Tarifa N1_0 (1 OR > 1 Comp > 1 US)
      if (!(r.tarifaN1_100 >= r.tarifaN1_50 - NUMERIC_TOLERANCE)) {
        warnings.push({
          code: "T3_ORDER_N1",
          message: `city=${r.cityCode}: Tarifa N1 100% (${r.tarifaN1_100}) < Tarifa N1 50% (${r.tarifaN1_50})`,
        });
      }
      if (!(r.tarifaN1_50 >= r.tarifaN1_0 - NUMERIC_TOLERANCE)) {
        warnings.push({
          code: "T3_ORDER_N1",
          message: `city=${r.cityCode}: Tarifa N1 50% (${r.tarifaN1_50}) < Tarifa N1 0% (${r.tarifaN1_0})`,
        });
      }
    }
    // Tarifa N1_0 ≥ N2 ≥ N3 — solo aplica si el estrato NO tiene subsidio en
    // Nivel 1 (de lo contrario la N1 neta puede ser menor que la N2 sin subsidio
    // y la regla deja de tener sentido como invariante de costo).
    if (r.pctSub0 === 0 && r.tarifaN1_0 > 0 && r.tarifaN2 > 0 && r.tarifaN1_0 < r.tarifaN2 - NUMERIC_TOLERANCE) {
      warnings.push({
        code: "T3_ORDER_LEVELS",
        message: `city=${r.cityCode}: Tarifa N1 0% (${r.tarifaN1_0}) < Tarifa N2 (${r.tarifaN2}).`,
      });
    }
    if (r.tarifaN2 > 0 && r.tarifaN3 > 0 && r.tarifaN2 < r.tarifaN3 - NUMERIC_TOLERANCE) {
      warnings.push({
        code: "T3_ORDER_LEVELS",
        message: `city=${r.cityCode}: Tarifa N2 (${r.tarifaN2}) < Tarifa N3 (${r.tarifaN3}).`,
      });
    }

    // % subsidio razonable (0..70)
    for (const [k, v] of [["pctSub100", r.pctSub100], ["pctSub50", r.pctSub50], ["pctSub0", r.pctSub0]] as const) {
      if (v < 0 || v > 70) {
        warnings.push({ code: "T3_SUB_RANGE", message: `city=${r.cityCode} ${k}=${v} fuera de [0,70].` });
      }
    }
    if (r.cfjm <= 0) {
      errors.push({ code: "T3_CFJM_NONPOS", message: `city=${r.cityCode}: Cfjm=${r.cfjm}` });
    }
  }

  return { format: "T3", passed: errors.length === 0, errors, warnings, info };
}
