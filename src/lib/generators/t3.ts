/**
 * Generador de filas T3 a partir de un SourceWorkbook ya parseado.
 *
 * ── REGLA DE NEGOCIO CLAVE ──────────────────────────────────────────────────
 *
 * BIA Energy publica subsidios SOLO en 3 mercados (Huila, Santander, Valle).
 * Para esos, el reporte visual trae los valores YA SUBSIDIADOS en las
 * columnas "Res. Estr. 1 / 2 / 3" del visual (campos `resEstr1/2/3` de
 * SourceRow). Para los otros 17 mercados, esas celdas vienen como "-" y por
 * tanto `resEstrN` queda `undefined`.
 *
 * Reglas:
 *   - Mercado CON resEstrN  → genera filas T3 para estratos 1, 2, 3 usando
 *                              el valor DIRECTO del source (no calcula nada).
 *   - Mercado SIN resEstrN  → NO genera filas para estratos 1, 2, 3.
 *   - Todos los mercados   → generan estratos 4..8 con cuPlusCot (sin
 *                              subsidio, %sub = 0).
 *
 * Por qué esto importa:
 *   La versión anterior aplicaba un 60/50/15% mecánico a `cuPlusCot` para
 *   TODOS los mercados — producía cifras espurias como Huila estrato 1 =
 *   316.26 cuando el valor publicado es 421.47. Era inconsistente con la
 *   publicación oficial.
 */

import type { SourceWorkbook, SourceRow, T3Row } from "../types.js";
import {
  findMercadoByName, findMercadoByCityCode, isSubsidizedMercado,
} from "../domain/mercados.js";
import { CARGO_HORARIO, FRANJA_DEFAULT, TARIFA_OT } from "../domain/constants.js";

export interface EstratoConfig {
  estrato: number;          // 1..6 residencial; 7+ para sectores
  pctSub100: number;        // % subsidio para nivel 1 100% OR
  pctSub50: number;
  pctSub0: number;
  /** Si true, se genera fila T3 para este estrato. */
  enabled: boolean;
}

/**
 * Default observado en T3 2026-04 — estratos 4..8 con %sub = 0 para
 * TODOS los mercados. Los estratos 1, 2, 3 NO van en el default; se
 * agregan automáticamente sólo para mercados con `resEstrN` definido.
 */
export const DEFAULT_ESTRATOS: EstratoConfig[] = [
  { estrato: 4, pctSub100: 0, pctSub50: 0, pctSub0: 0, enabled: true },
  { estrato: 5, pctSub100: 0, pctSub50: 0, pctSub0: 0, enabled: true },
  { estrato: 6, pctSub100: 0, pctSub50: 0, pctSub0: 0, enabled: true },
  { estrato: 7, pctSub100: 0, pctSub50: 0, pctSub0: 0, enabled: true },
  { estrato: 8, pctSub100: 0, pctSub50: 0, pctSub0: 0, enabled: true },
];

export interface GenerateT3Options {
  fechaPublicacion: Date;
  diarioPublicacion: string;
  tarifaOT?: number;                  // por defecto: NO aplica (=2)
  cargoHorario?: number;              // por defecto: monomio (=4)
  /**
   * Estratos NO subsidiados (4..8 por default). Los estratos subsidiados
   * (1, 2, 3) se agregan dinámicamente y SOLO para mercados con resEstrN.
   */
  estratos?: EstratoConfig[];
  /**
   * RECOMENDADO: T3 del mes anterior (o de la publicación previa). Cuando se
   * proporciona, el generador toma la ESTRUCTURA exacta (qué estratos publica
   * cada mercado, qué % de subsidio, qué diario, qué tarifa OT) del template
   * y reemplaza únicamente los VALORES tarifarios con los del source —
   * priorizando los valores de `resEstrN` cuando aplica.
   */
  template?: T3Row[];
  /** Trunca a 5 decimales en vez de redondear. Default: false. */
  truncate5?: boolean;
}

/* ───────────────────────────── helpers ─────────────────────────────── */

/** Valor válido de res.estr.N: número finito > 0 (las celdas vacías/dash/formula=0 no cuentan). */
function isValidResEstr(v: number | undefined): boolean {
  return v != null && Number.isFinite(v) && v > 0;
}

/** Toma el valor adecuado: si el estrato 1/2/3 tiene resEstrN válido, lo usa; si no, cuPlusCot. */
function tarifaFor(level: SourceRow, estrato: number): number {
  if (estrato === 1 && isValidResEstr(level.resEstr1)) return level.resEstr1 as number;
  if (estrato === 2 && isValidResEstr(level.resEstr2)) return level.resEstr2 as number;
  if (estrato === 3 && isValidResEstr(level.resEstr3)) return level.resEstr3 as number;
  return level.cuPlusCot;
}

// (función hasResEstr eliminada — la autoridad es el catálogo
// SUBSIDIZED_CITY_CODES en domain/mercados.ts, no el contenido del source.)

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
    tarifaN1_100: tarifaFor(a.r100, a.estrato),
    tarifaN1_50:  tarifaFor(a.r50,  a.estrato),
    tarifaN1_0:   tarifaFor(a.r0,   a.estrato),
    tarifaN2: tarifaFor(a.r2, a.estrato),
    tarifaN3: tarifaFor(a.r3, a.estrato),
    tarifaN4: 0,
    cfjm: a.cfjm,
    fechaPublicacion: a.fechaPublicacion,
    diarioPublicacion: a.diarioPublicacion,
    tarifaOT: a.tarifaOT,
  };
}

/* ───────────────────────────── generadores ─────────────────────────────── */

export function generateT3(source: SourceWorkbook, opts: GenerateT3Options): T3Row[] {
  const cargoHorario = opts.cargoHorario ?? CARGO_HORARIO.MONOMIO;
  const tarifaOT     = opts.tarifaOT     ?? TARIFA_OT.NO;

  // Agrupa source por mercado×nivel
  const byMercado = new Map<string, Record<string, SourceRow>>();
  for (const r of source.rows) {
    if (!byMercado.has(r.mercado)) byMercado.set(r.mercado, {});
    byMercado.get(r.mercado)![r.level] = r;
  }

  // MODO A — TEMPLATE: la estructura sale del template del mes anterior.
  if (opts.template && opts.template.length > 0) {
    return generateFromTemplate(opts.template, byMercado, {
      fechaPublicacion: opts.fechaPublicacion,
      diarioPublicacion: opts.diarioPublicacion,
      tarifaOT, cargoHorario,
    });
  }

  // MODO B — sin template: estratos 4..8 para todos los mercados; +1,2,3 solo
  // para mercados con res.estr.N publicada.
  const baseEstratos = opts.estratos ?? DEFAULT_ESTRATOS;
  const rows: T3Row[] = [];
  for (const [mercado, levels] of byMercado) {
    const info = findMercadoByName(mercado);
    if (!info) continue;
    const r100 = levels["1-100"]; const r50 = levels["1-50"]; const r0 = levels["1-0"];
    const r2   = levels["2"];     const r3  = levels["3"];
    if (!r100 || !r50 || !r0 || !r2 || !r3) continue;

    // Determinar la lista total de estratos para ESTE mercado:
    //   base (4..8) + 1/2/3 si está en la lista SUBSIDIZED_CITY_CODES.
    // Los estratos 1-3 SIEMPRE se generan para los 3 mercados subsidiados,
    // incluso si el source carece de algún resEstr (en ese caso tarifaFor
    // hace fallback a cuPlusCot — el SUI prefiere fila incompleta que
    // ausencia total).
    const allEstratos: EstratoConfig[] = [];
    if (isSubsidizedMercado(info.cityCode)) {
      for (const e of [1, 2, 3]) {
        allEstratos.push({ estrato: e, pctSub100: 0, pctSub50: 0, pctSub0: 0, enabled: true });
      }
    }
    for (const e of baseEstratos) {
      if (e.enabled && e.estrato >= 4) allEstratos.push(e);
    }
    allEstratos.sort((a, b) => a.estrato - b.estrato);

    for (const e of allEstratos) {
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

/* ───────────────────────────── template mode ────────────────────────────── */

interface TemplateCtx {
  fechaPublicacion: Date;
  diarioPublicacion: string;
  tarifaOT: number;
  cargoHorario: number;
}

function generateFromTemplate(
  template: T3Row[],
  byMercado: Map<string, Record<string, SourceRow>>,
  ctx: TemplateCtx,
): T3Row[] {
  // index source rows por cityCode
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
      out.push(t); // mercado del template no está en source → preservar
      continue;
    }
    const r100 = levels["1-100"]; const r50 = levels["1-50"]; const r0 = levels["1-0"];
    const r2   = levels["2"];     const r3  = levels["3"];
    if (!r100 || !r50 || !r0 || !r2 || !r3) { out.push(t); continue; }

    out.push({
      ...t,
      cargoHorario: t.cargoHorario || ctx.cargoHorario,
      tarifaOT: t.tarifaOT || ctx.tarifaOT,
      fechaPublicacion: ctx.fechaPublicacion,
      diarioPublicacion: ctx.diarioPublicacion,
      // Valores recalculados — USANDO res.estr.N si el estrato es 1/2/3 y el
      // source los expone. NUNCA aplicar % subsidio mecánico al cuPlusCot.
      tarifaN1_100: tarifaFor(r100, t.estrato),
      tarifaN1_50:  tarifaFor(r50,  t.estrato),
      tarifaN1_0:   tarifaFor(r0,   t.estrato),
      tarifaN2: tarifaFor(r2, t.estrato),
      tarifaN3: tarifaFor(r3, t.estrato),
      tarifaN4: t.tarifaN4 ?? 0,
      // Preservamos pctSub del template — son los % oficiales del SUI
      // (60/50/15/0) que la empresa reporta históricamente. NO los forzamos
      // a 0 aunque las tarifas ya estén netas, porque el SUI valida que el
      // pctSub sea consistente con el catálogo nacional.
      pctSub100: t.pctSub100, pctSub50: t.pctSub50, pctSub0: t.pctSub0,
      cfjm: r100.cfjm,
    });
  }
  return out;
}
