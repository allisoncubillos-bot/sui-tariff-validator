/**
 * Generador de filas T3 a partir de un SourceWorkbook ya parseado.
 *
 * Estrategia:
 *   - Por cada mercado, agrupamos las 5 filas (1-100, 1-50, 1-0, 2, 3) y
 *     construimos las 6 (o N) filas T3 — una por estrato/sector.
 *   - Las tarifas de Nivel 1 toman CU+COT de las filas 1-OR / 1-Comp / 1-US.
 *   - Tarifa Nivel 2 y 3 toman CU+COT de las filas 2 y 3.
 *   - Tarifa Nivel 4: 0 (BIA Energy no opera N4 según el archivo 2026-04).
 *   - Subsidios y estratos: opcionalmente vienen de un catálogo de la
 *     empresa; si no, se completan con los valores por defecto observados
 *     en el T3 provisional (0 para sectores no residenciales, etc.).
 */

import type { SourceWorkbook, SourceRow, T3Row } from "../types.js";
import { findMercadoByName, findMercadoByCityCode } from "../domain/mercados.js";
import { CARGO_HORARIO, FRANJA_DEFAULT, TARIFA_OT } from "../domain/constants.js";

/**
 * Configuración por estrato para T3. Cada estrato puede tener distintos %
 * de subsidio que se aplican a las tarifas de Nivel 1.
 *
 * Default basado en T3 2026-04 observado:
 *   - Estratos 1, 2, 3 y 4 reportan con %sub=0 (BIA no tiene subsidio en N1).
 *   - Pero la regulación permite hasta 60% para estrato 1, 50% para 2, etc.
 *
 * Si la empresa configura subsidios distintos por estrato/mercado/mes, se
 * inyecta aquí (puede venir desde Lovable como tabla editable).
 */
export interface EstratoConfig {
  estrato: number;          // 1..6 residencial; 7+ para sectores
  pctSub100: number;        // % subsidio para nivel 1 100% OR
  pctSub50: number;
  pctSub0: number;
  /** Si true, se genera fila T3 para este estrato. */
  enabled: boolean;
}

export const DEFAULT_ESTRATOS: EstratoConfig[] = [
  { estrato: 1, pctSub100: 60, pctSub50: 60, pctSub0: 60, enabled: true },
  { estrato: 2, pctSub100: 50, pctSub50: 50, pctSub0: 50, enabled: true },
  { estrato: 3, pctSub100: 15, pctSub50: 15, pctSub0: 15, enabled: true },
  { estrato: 4, pctSub100: 0,  pctSub50: 0,  pctSub0: 0,  enabled: true },
  { estrato: 5, pctSub100: 0,  pctSub50: 0,  pctSub0: 0,  enabled: true },
  { estrato: 6, pctSub100: 0,  pctSub50: 0,  pctSub0: 0,  enabled: true },
];

export interface GenerateT3Options {
  fechaPublicacion: Date;
  diarioPublicacion: string;
  tarifaOT?: number;                  // por defecto: NO aplica (=2)
  cargoHorario?: number;              // por defecto: monomio (=4)
  /**
   * Lista global de estratos a emitir POR MERCADO. Ignorada si se provee
   * `template`. Default: estratos 1..6.
   */
  estratos?: EstratoConfig[];
  /**
   * RECOMENDADO: T3 del mes anterior (o de la publicación previa). Cuando
   * se proporciona, el generador toma la ESTRUCTURA (qué estratos publica
   * cada mercado, sus % de subsidio, su diario, su tarifa OT) del template
   * y reemplaza únicamente los VALORES tarifarios con los del SourceWorkbook.
   *
   * Esto evita tener que mantener manualmente DEFAULT_ESTRATOS y permite que
   * cada mercado tenga su propia política de subsidios sin configuración.
   */
  template?: T3Row[];
  /**
   * Cuando true, las tarifas se truncan a 5 decimales en lugar de redondear.
   * Default: false (redondeo IEEE-754 estándar).
   */
  truncate5?: boolean;
}

export function generateT3(source: SourceWorkbook, opts: GenerateT3Options): T3Row[] {
  const cargoHorario = opts.cargoHorario ?? CARGO_HORARIO.MONOMIO;
  const tarifaOT     = opts.tarifaOT     ?? TARIFA_OT.NO;

  // Agrupa source por mercado×nivel para lookup rápido
  const byMercado = new Map<string, Record<string, SourceRow>>();
  for (const r of source.rows) {
    if (!byMercado.has(r.mercado)) byMercado.set(r.mercado, {});
    byMercado.get(r.mercado)![r.level] = r;
  }

  // MODO A — TEMPLATE: tomamos la estructura (estratos, %sub) del template y
  // recalculamos las tarifas con los valores del source.
  if (opts.template && opts.template.length > 0) {
    return generateFromTemplate(source, opts.template, byMercado, {
      fechaPublicacion: opts.fechaPublicacion,
      diarioPublicacion: opts.diarioPublicacion,
      tarifaOT, cargoHorario,
    });
  }

  // MODO B — sin template: usamos estratos uniformes para todos los mercados
  const estratos = opts.estratos ?? DEFAULT_ESTRATOS;
  const rows: T3Row[] = [];
  for (const [mercado, levels] of byMercado) {
    const info = findMercadoByName(mercado);
    if (!info) continue;
    const r100 = levels["1-100"]; const r50 = levels["1-50"]; const r0 = levels["1-0"];
    const r2   = levels["2"];     const r3  = levels["3"];
    if (!r100 || !r50 || !r0 || !r2 || !r3) continue;

    for (const e of estratos) {
      if (!e.enabled) continue;
      rows.push(buildRow({
        cityCode: info.cityCode, cargoHorario, estrato: e.estrato,
        pctSub100: e.pctSub100, pctSub50: e.pctSub50, pctSub0: e.pctSub0,
        r100, r50, r0, r2, r3, cfjm: r100.cfjm,
        fechaPublicacion: opts.fechaPublicacion,
        diarioPublicacion: opts.diarioPublicacion,
        tarifaOT,
      }));
    }
  }
  return rows;
}

interface BuildArgs {
  cityCode: number; cargoHorario: number; estrato: number;
  pctSub100: number; pctSub50: number; pctSub0: number;
  r100: SourceRow; r50: SourceRow; r0: SourceRow; r2: SourceRow; r3: SourceRow;
  cfjm: number;
  fechaPublicacion: Date; diarioPublicacion: string; tarifaOT: number;
}

function buildRow(a: BuildArgs): T3Row {
  return {
    cityCode: a.cityCode,
    cargoHorario: a.cargoHorario,
    inicioFranja: FRANJA_DEFAULT.inicio,
    finFranja:    FRANJA_DEFAULT.fin,
    estrato: a.estrato,
    pctSub100: a.pctSub100, pctSub50: a.pctSub50, pctSub0: a.pctSub0,
    tarifaN1_100: applySubsidy(a.r100.cuPlusCot, a.pctSub100),
    tarifaN1_50:  applySubsidy(a.r50.cuPlusCot,  a.pctSub50),
    tarifaN1_0:   applySubsidy(a.r0.cuPlusCot,   a.pctSub0),
    tarifaN2: a.r2.cuPlusCot,
    tarifaN3: a.r3.cuPlusCot,
    tarifaN4: 0,
    cfjm: a.cfjm,
    fechaPublicacion: a.fechaPublicacion,
    diarioPublicacion: a.diarioPublicacion,
    tarifaOT: a.tarifaOT,
  };
}

interface TemplateCtx {
  fechaPublicacion: Date;
  diarioPublicacion: string;
  tarifaOT: number;
  cargoHorario: number;
}

function generateFromTemplate(
  _source: SourceWorkbook,
  template: T3Row[],
  byMercado: Map<string, Record<string, SourceRow>>,
  ctx: TemplateCtx,
): T3Row[] {
  // index source rows by cityCode
  const byCity = new Map<number, Record<string, SourceRow>>();
  for (const [mercado, levels] of byMercado) {
    const info = findMercadoByName(mercado);
    if (!info) continue;
    byCity.set(info.cityCode, levels);
  }

  const out: T3Row[] = [];
  for (const t of template) {
    const levels = byCity.get(t.cityCode);
    const info = findMercadoByCityCode(t.cityCode);
    if (!levels || !info) {
      // Mercado del template no presente en el source → conservamos la fila tal cual.
      out.push(t);
      continue;
    }
    const r100 = levels["1-100"]; const r50 = levels["1-50"]; const r0 = levels["1-0"];
    const r2   = levels["2"];     const r3  = levels["3"];
    if (!r100 || !r50 || !r0 || !r2 || !r3) { out.push(t); continue; }

    out.push({
      ...t,
      // Estructura (estrato, % subsidio, cargo, franjas, tarifa OT, diario, fecha)
      // se mantiene del template, salvo lo que el caller fija explícitamente.
      cargoHorario: t.cargoHorario || ctx.cargoHorario,
      tarifaOT: t.tarifaOT || ctx.tarifaOT,
      fechaPublicacion: ctx.fechaPublicacion,
      diarioPublicacion: ctx.diarioPublicacion,
      // Valores recalculados desde el source
      tarifaN1_100: applySubsidy(r100.cuPlusCot, t.pctSub100),
      tarifaN1_50:  applySubsidy(r50.cuPlusCot,  t.pctSub50),
      tarifaN1_0:   applySubsidy(r0.cuPlusCot,   t.pctSub0),
      tarifaN2: r2.cuPlusCot,
      tarifaN3: r3.cuPlusCot,
      tarifaN4: t.tarifaN4 ?? 0,
      cfjm: r100.cfjm,
    });
  }
  return out;
}

/**
 * Aplica el subsidio: tarifa_estrato = CU+COT × (1 − pct/100)
 *
 * NOTA: La validación contra el T3 2026-04 muestra que el provisional
 * NO aplica subsidio (las tarifas son iguales al CU+COT y los % son 0).
 * Esa observación se confirma en el comparador. Si el catálogo trae
 * pctSub > 0, esta función calcula el valor neto.
 */
function applySubsidy(cuPlusCot: number, pct: number): number {
  if (!pct) return cuPlusCot;
  return cuPlusCot * (1 - pct / 100);
}
