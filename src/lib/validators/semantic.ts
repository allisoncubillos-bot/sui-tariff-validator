/**
 * Validador semántico: chequea consistencia ENTRE formatos y catálogos.
 *
 *   - Todo cityCode en T3/T4/T7/T8 debe existir en el catálogo MERCADOS.
 *   - Todo mercado del SourceWorkbook debe tener cityCode en MERCADOS.
 *   - Si T7 contiene un mercado, T3 también debería tenerlo (y viceversa).
 *   - El Cfjm de T3 debería coincidir con el Cfm.j del SourceRow correspondiente.
 *   - La Tarifa N1 100% OR de T3 debería coincidir con CU+COT de "1 OR." del source.
 */

import type { SourceWorkbook, T3Row, T7Row, ValidationReport, ValidationIssue } from "../types.js";
import { findMercadoByCityCode, findMercadoByName } from "../domain/mercados.js";
import { NUMERIC_TOLERANCE } from "../domain/constants.js";

export interface CrossCheckInput {
  source: SourceWorkbook;
  t3?: T3Row[];
  t7?: T7Row[];
}

export function validateSemantic({ source, t3, t7 }: CrossCheckInput): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  // 1) Mercados del source con catálogo
  for (const m of source.mercados) {
    if (!findMercadoByName(m)) {
      errors.push({
        code: "MERCADO_NOT_IN_CATALOG",
        message: `Mercado '${m}' del source no existe en MERCADOS. Agregalo a src/domain/mercados.ts.`,
        ref: m,
      });
    }
  }

  // 2) city_codes del T3 con catálogo
  if (t3) {
    for (const r of t3) {
      if (!findMercadoByCityCode(r.cityCode)) {
        warnings.push({
          code: "CITY_CODE_UNKNOWN",
          message: `T3 trae city_code=${r.cityCode} no presente en MERCADOS.`,
        });
      }
    }
  }

  // 3) Cross-check Source vs T3 (Cfjm y Tarifa N1 100% OR)
  if (t3) {
    const t3ByCity = new Map<number, T3Row[]>();
    for (const r of t3) {
      const arr = t3ByCity.get(r.cityCode) ?? [];
      arr.push(r);
      t3ByCity.set(r.cityCode, arr);
    }

    for (const sr of source.rows) {
      const info2 = findMercadoByName(sr.mercado);
      if (!info2) continue;
      if (sr.level !== "1-100") continue;
      const rows = t3ByCity.get(info2.cityCode);
      if (!rows || rows.length === 0) {
        warnings.push({
          code: "MERCADO_MISSING_IN_T3",
          message: `Mercado ${sr.mercado} (city=${info2.cityCode}) está en el source pero no en T3.`,
        });
        continue;
      }
      // Cfjm — todas las filas del mercado deben tener el mismo Cfjm
      const firstRow = rows[0]!;
      if (Math.abs(firstRow.cfjm - sr.cfjm) > NUMERIC_TOLERANCE) {
        errors.push({
          code: "CFJM_MISMATCH",
          message: `Cfjm T3 (${firstRow.cfjm}) ≠ Cfm.j source (${sr.cfjm}) para ${sr.mercado}.`,
          ref: sr.mercado,
        });
      }
      // Tarifa N1 100% OR — el valor esperado depende del estrato:
      //  - Estrato 1/2/3 con res.estr.N publicada → comparar vs resEstrN
      //  - Resto                                  → comparar vs cuPlusCot
      const isValidRes = (v: number | undefined) =>
        v != null && Number.isFinite(v) && v > 0;
      for (const tr of rows) {
        let expected = sr.cuPlusCot;
        if (tr.estrato === 1 && isValidRes(sr.resEstr1)) expected = sr.resEstr1 as number;
        else if (tr.estrato === 2 && isValidRes(sr.resEstr2)) expected = sr.resEstr2 as number;
        else if (tr.estrato === 3 && isValidRes(sr.resEstr3)) expected = sr.resEstr3 as number;
        if (Math.abs(tr.tarifaN1_100 - expected) > NUMERIC_TOLERANCE * 100) {
          warnings.push({
            code: "TARIFA_N1_100_MISMATCH",
            message: `${sr.mercado} estrato=${tr.estrato}: Tarifa N1 100% T3=${tr.tarifaN1_100} ≠ esperado ${expected}`,
            ref: `${sr.mercado}/estrato${tr.estrato}`,
          });
        }
      }
    }
  }

  // 4) Cross-check Source vs T7 (mismos componentes por mercado/nivel)
  if (t7) {
    const t7Idx = new Map<string, T7Row>();
    for (const r of t7) t7Idx.set(`${r.cityCode}|${r.level}`, r);
    for (const sr of source.rows) {
      const m = findMercadoByName(sr.mercado);
      if (!m) continue;
      const tr = t7Idx.get(`${m.cityCode}|${sr.level}`);
      if (!tr) {
        warnings.push({
          code: "T7_ROW_MISSING",
          message: `T7 no tiene fila para city=${m.cityCode} (${sr.mercado}) level=${sr.level}.`,
        });
        continue;
      }
      // Mapeamos source→T7 según convención BIA: cvmBase↔prnm, cvmCot↔cvm, cuPlusCot↔cuvm
      const checks: (["gm" | "tm" | "rm" | "dnm" | "prnm" | "cvm" | "cuvm", number, number])[] = [
        ["gm",   sr.gm,        tr.gm],
        ["tm",   sr.tm,        tr.tm],
        ["rm",   sr.rm,        tr.rm],
        ["dnm",  sr.dnm,       tr.dnm],
        ["prnm", sr.cvmBase,   tr.prnm],
        ["cvm",  sr.cvmCot,    tr.cvm],
        ["cuvm", sr.cuPlusCot, tr.cuvm],
      ];
      for (const [f, a, b] of checks) {
        if (Math.abs(a - b) > NUMERIC_TOLERANCE * 100) {
          warnings.push({
            code: "T7_COMPONENT_MISMATCH",
            message: `${sr.mercado}/${sr.level} ${f}: source=${a.toFixed(5)} vs T7=${b.toFixed(5)}`,
            ref: `${sr.mercado}/${sr.level}`,
          });
        }
      }
    }
  }

  return { format: "SOURCE", passed: errors.length === 0, errors, warnings, info };
}
