/**
 * Generador de filas T7 a partir de un SourceWorkbook ya parseado.
 *
 * Por cada SourceRow (mercado × nivel) emitimos exactamente UNA fila T7.
 * Las 5 filas por mercado se conservan (una por LevelCode).
 */

import type { SourceWorkbook, T7Row } from "../types.js";
import { findMercadoByName } from "../domain/mercados.js";
import { CARGO_HORARIO } from "../domain/constants.js";

export interface GenerateT7Options {
  cargoHorario?: number; // default: monomio (4)
}

export function generateT7(source: SourceWorkbook, opts: GenerateT7Options = {}): T7Row[] {
  const cargoHorario = opts.cargoHorario ?? CARGO_HORARIO.MONOMIO;

  const rows: T7Row[] = [];
  for (const r of source.rows) {
    const info = findMercadoByName(r.mercado);
    if (!info) continue;
    rows.push({
      cityCode: info.cityCode,
      level: r.level,
      gm: r.gm, tm: r.tm, rm: r.rm,
      dnm: r.dnm,
      // BIA usa T7.prnm para el Cvm BASE y T7.cvm para Cvm+COT (ver types.ts)
      prnm: r.cvmBase,
      cvm:  r.cvmCot,
      cuvm: r.cuPlusCot,
      cargoHorario,
    });
  }
  return rows;
}
