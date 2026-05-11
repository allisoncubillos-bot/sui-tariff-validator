/**
 * Parser del Excel ORIGEN (reporte visual mensual de tarifas publicadas).
 *
 * Estructura observada (verificada con "6376. Publicación Abril.xlsx"):
 *   - Filas 1–3: cabecera (título, periodo, headers de columna)
 *   - Fila 2:    contiene Tm (columna D) y Rm,i (columna G) GLOBALES
 *   - Filas 4..: bloques de 5 filas por mercado:
 *                 [+0] 1 OR. (100% OR)
 *                 [+1] 1 Comp. (50% OR)
 *                 [+2] 1 US. (0% OR)
 *                 [+3] 2
 *                 [+4] 3
 *   - Columna A: celda combinada con rich-text "MERCADO\nCfm.j N.NNN"
 *   - Columna B: etiqueta del nivel ("1 OR.", "1 Comp.", "1 US.", 2, 3)
 *
 * El parser:
 *   1) Detecta la fila de encabezado de columnas (la que contiene "MERCADO").
 *   2) Recorre filas; cada vez que la columna A trae rich-text,
 *      arranca un bloque nuevo de mercado y extrae nombre + Cfm.j.
 *   3) Lee 5 filas consecutivas; mapea las columnas según el layout inferido.
 *   4) Reporta diagnósticos: niveles faltantes, mercados duplicados,
 *      inconsistencia matemática Gm+Tm+Rm+Dm+PR+Cvm ≠ CU, etc.
 */

import { readXlsx, type SheetSnapshot, type XlsxInput } from "./xlsx-reader.js";
import { inferLayout, type ComponentColumnMap } from "./column-inference.js";
import { toLevelCode } from "../domain/niveles.js";
import { NUMERIC_TOLERANCE } from "../domain/constants.js";
import type {
  SourceWorkbook,
  SourceRow,
  ParseDiagnostic,
  LevelCode,
  LevelLabel,
} from "../types.js";

export interface ParseOptions {
  /** Si true, el parser falla con throw al primer error crítico. Default: false. */
  strict?: boolean;
  /** Override manual del layout (útil para archivos con etiquetas cruzadas). */
  layoutOverride?: Partial<ComponentColumnMap>;
}

export async function parsePublicationSource(
  input: XlsxInput,
  opts: ParseOptions = {},
): Promise<SourceWorkbook> {
  const sheet = await readXlsx(input);
  const diagnostics: ParseDiagnostic[] = [];

  // 1) Encuentra la fila de encabezado de columnas (contiene "MERCADO" en col A o B)
  const headerRow = findHeaderRow(sheet, diagnostics);

  // 2) Globales Tm / Rm,i — buscamos en fila headerRow-1 (típicamente fila 2)
  const { tmGlobal, rmGlobalByLevel } = extractGlobals(sheet, headerRow, diagnostics);

  // 3) Layout de columnas: inferencia con verificación matemática
  const probeRow = headerRow + 1;
  const inferred = inferLayout(
    sheet,
    probeRow,
    tmGlobal,
    rmGlobalByLevel?.["1-100"],
  );
  const layout: ComponentColumnMap = { ...inferred.layout, ...opts.layoutOverride };
  diagnostics.push({
    level: inferred.confidence === "high" ? "info" : "warn",
    code: "LAYOUT_INFERRED",
    message: `Layout confianza=${inferred.confidence}. ${inferred.reason}`,
  });

  // 4) Periodo: extraído del header del archivo
  const period = extractPeriod(sheet, diagnostics);

  // 5) Recorre filas y construye bloques de mercado
  const rows: SourceRow[] = [];
  const mercados: string[] = [];
  const seen = new Set<string>();

  for (let r = probeRow; r <= sheet.rowCount; r++) {
    const aText = sheet.text(`A${r}`);
    const bRaw = sheet.cell(`B${r}`);

    // Empieza un bloque si la columna A tiene "MERCADO\nCfm.j ..."
    const mercadoBlock = parseMercadoCell(aText);
    if (mercadoBlock) {
      if (seen.has(mercadoBlock.mercado)) {
        diagnostics.push({
          level: "warn",
          code: "MERCADO_DUPLICATE",
          message: `Mercado repetido: ${mercadoBlock.mercado}`,
          mercado: mercadoBlock.mercado,
          cellRef: `A${r}`,
        });
      }
      seen.add(mercadoBlock.mercado);
      mercados.push(mercadoBlock.mercado);
    }
    // El nombre activo: o el que acabamos de detectar o el último visto
    const currentMercado = mercadoBlock?.mercado ?? mercados[mercados.length - 1];
    const currentCfjm   = mercadoBlock?.cfjm     ?? lastCfjm(rows);

    if (!currentMercado) continue; // aún no entramos al bloque de datos
    if (currentCfjm == null) continue;

    // El nivel está en columna B; si no hay nivel reconocible, ignoramos la fila.
    const levelCode = toLevelCode(bRaw);
    if (!levelCode) {
      // Posiblemente la fila es de notas/pie. Si ya pasamos los 21 mercados, paramos.
      if (mercados.length >= 1 && isNoteOrFooter(aText)) break;
      continue;
    }

    const row = readDataRow(sheet, r, layout, {
      mercado: currentMercado,
      cfjm: currentCfjm,
      level: levelCode,
      levelLabel: codeToVisualLabel(levelCode),
      tmGlobal,
      rmForLevel: rmGlobalByLevel?.[levelCode],
    }, diagnostics);

    if (row) rows.push(row);
  }

  // 6) Validación matemática puntual: CU = Gm + Tm + Rm + Dm + PR + Cvm_base
  for (const r of rows) {
    const sum = r.gm + r.tm + r.rm + r.dnm + r.prLoss + r.cvmBase;
    if (Math.abs(sum - r.cuvm) > NUMERIC_TOLERANCE * 100) {
      diagnostics.push({
        level: "error",
        code: "CU_EQUATION_MISMATCH",
        message: `CU calculado (${sum.toFixed(5)}) ≠ CU leído (${r.cuvm.toFixed(5)})`,
        mercado: r.mercado,
      });
    }
    // Identidad complementaria: CU+COT = Gm+Tm+Rm+Dm+Cvm_base+Cvm_cot
    const sumCot = r.gm + r.tm + r.rm + r.dnm + r.cvmBase + r.cvmCot;
    if (Math.abs(sumCot - r.cuPlusCot) > NUMERIC_TOLERANCE * 100) {
      diagnostics.push({
        level: "warn",
        code: "CU_COT_EQUATION_MISMATCH",
        message: `CU+COT calculado (${sumCot.toFixed(5)}) ≠ CU+COT leído (${r.cuPlusCot.toFixed(5)})`,
        mercado: r.mercado,
      });
    }
  }

  if (opts.strict && diagnostics.some((d) => d.level === "error")) {
    throw new Error(
      "Errores críticos al parsear:\n" +
        diagnostics
          .filter((d) => d.level === "error")
          .map((d) => `[${d.code}] ${d.message}`)
          .join("\n"),
    );
  }

  return {
    period,
    tmGlobal,
    rmGlobalByLevel,
    isRepublication: false,
    rows,
    mercados,
    diagnostics,
  };
}

/* ──────────────────────────── helpers ──────────────────────────── */

function findHeaderRow(sheet: SheetSnapshot, diag: ParseDiagnostic[]): number {
  for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
    const a = String(sheet.text(`A${r}`) ?? "").trim().toUpperCase();
    const b = String(sheet.text(`B${r}`) ?? "").trim().toUpperCase();
    if (a === "MERCADO" || b.startsWith("NIV")) return r;
  }
  diag.push({
    level: "warn",
    code: "HEADER_NOT_FOUND",
    message: "No se encontró la fila con 'MERCADO'; se asume fila 3.",
  });
  return 3;
}

function extractGlobals(
  sheet: SheetSnapshot,
  headerRow: number,
  diag: ParseDiagnostic[],
): { tmGlobal?: number; rmGlobalByLevel?: Partial<Record<LevelCode, number>> } {
  // En 2026-04: D2=Tm global (~55.95), G2=Rm,i global (~23.61)
  // Estos son valores únicos para todo el mes, no por mercado.
  const tm = sheet.num(`D${headerRow - 1}`);
  const rm = sheet.num(`G${headerRow - 1}`);
  if (tm != null) {
    diag.push({
      level: "info",
      code: "TM_GLOBAL",
      message: `Tm global detectado: ${tm}`,
      cellRef: `D${headerRow - 1}`,
    });
  }
  // En el reporte visual, el Rm,i de la 2026-04 es GLOBAL (un único valor para
  // todos los mercados y todos los niveles). Lo asignamos a los 5 niveles para
  // que el parser de fila NO lo derive aritméticamente desde CU −
  // (Gm+Tm+Dm+PR+Cvm) — la derivación introducía error de coma flotante
  // (±0.0001) en T7 niveles 2 y 3.
  //
  // Si en un futuro el visual expone un Rm,i POR NIVEL en columnas separadas,
  // este map debe extenderse leyendo de esas celdas. La republicación ya tiene
  // Rm per-row (ver source-republication.ts) — caso distinto.
  const map: Partial<Record<LevelCode, number>> = {};
  if (rm != null) {
    map["1-100"] = rm; map["1-50"] = rm; map["1-0"] = rm;
    map["2"]     = rm; map["3"]    = rm;
  }
  return { tmGlobal: tm, rmGlobalByLevel: map };
}

function extractPeriod(
  sheet: SheetSnapshot,
  diag: ParseDiagnostic[],
): { year: number; month: number; label: string } {
  // Busca un string tipo "Abril de 2026" en las primeras 5 filas, cualquier col
  const MONTHS: Record<string, number> = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
  };
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= sheet.columnCount; c++) {
      const t = String(sheet.cellAt(r, c) ?? "").toUpperCase();
      const m = t.match(/(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DE\s+)?(\d{4})/);
      if (m) {
        const month = MONTHS[m[1]!]!;
        const year = Number(m[2]);
        return { year, month, label: `${m[1]} de ${year}` };
      }
    }
  }
  diag.push({
    level: "warn",
    code: "PERIOD_NOT_FOUND",
    message: "No se detectó el periodo en el archivo. Default: mes actual.",
  });
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    label: now.toISOString().slice(0, 7),
  };
}

function parseMercadoCell(text: string): { mercado: string; cfjm: number } | undefined {
  if (!text) return undefined;
  // Rich text "MERCADO\nCfm.j N.NNN" — pero ExcelJS a veces devuelve sin \n.
  const cfjmMatch = text.match(/Cfm\.?\s*j\s*([\d.,]+)/i);
  if (!cfjmMatch) return undefined;
  const cfjm = Number(cfjmMatch[1]!.replace(",", "."));
  if (!Number.isFinite(cfjm)) return undefined;
  // Mercado = texto antes de "Cfm.j", limpio
  const mercado = text.replace(cfjmMatch[0], "").replace(/[\s\n\r]+/g, " ").trim();
  if (!mercado) return undefined;
  return { mercado, cfjm };
}

function isNoteOrFooter(text: string): boolean {
  const up = text.toUpperCase();
  return up.includes("NOTA") || up.includes("VIGILADA") || up.includes("CONTRIBUCIÓN DE SOLIDARIDAD");
}

function lastCfjm(rows: SourceRow[]): number | undefined {
  return rows[rows.length - 1]?.cfjm;
}

function codeToVisualLabel(c: LevelCode): LevelLabel {
  switch (c) {
    case "1-100": return "1 OR.";
    case "1-50":  return "1 Comp.";
    case "1-0":   return "1 US.";
    case "2":     return "2";
    case "3":     return "3";
  }
}

interface ReadCtx {
  mercado: string;
  cfjm: number;
  level: LevelCode;
  levelLabel: LevelLabel;
  tmGlobal: number | undefined;
  rmForLevel: number | undefined;
}

function readDataRow(
  sheet: SheetSnapshot,
  r: number,
  layout: ComponentColumnMap,
  ctx: ReadCtx,
  diag: ParseDiagnostic[],
): SourceRow | undefined {
  const get = (col: string | "GLOBAL", fallback: number | undefined): number | undefined => {
    if (col === "GLOBAL") return fallback;
    return sheet.num(`${col}${r}`);
  };

  const gm        = sheet.num(`${layout.gm}${r}`);
  const cvmBase   = sheet.num(`${layout.cvm}${r}`);
  const cvmCot    = sheet.num(`${layout.cvmCot}${r}`);
  const dnm       = sheet.num(`${layout.dnm}${r}`);
  const prLoss    = sheet.num(`${layout.prnm}${r}`);
  const cuvm      = sheet.num(`${layout.cuvm}${r}`);
  const cuPlusCot = sheet.num(`${layout.cuPlusCot}${r}`);
  const tm        = get(layout.tm, ctx.tmGlobal);
  let   rm        = get(layout.rm, ctx.rmForLevel);

  // Si Rm no era global y no lo tenemos, lo derivamos:
  //   CU = Gm + Tm + Rm + Dm + PR + Cvm   →   Rm = CU − (Gm+Tm+Dm+PR+Cvm)
  if (rm == null && gm != null && tm != null && cuvm != null
      && dnm != null && prLoss != null && cvmBase != null) {
    rm = cuvm - (gm + tm + dnm + prLoss + cvmBase);
  }

  if ([gm, tm, rm, dnm, prLoss, cvmBase, cvmCot, cuvm, cuPlusCot]
      .some((v) => v == null || !Number.isFinite(v))) {
    diag.push({
      level: "warn",
      code: "ROW_INCOMPLETE",
      message: `Fila ${r} (${ctx.mercado}, nivel ${ctx.level}) tiene valores faltantes; se omite.`,
      mercado: ctx.mercado,
      cellRef: `${r}`,
    });
    return undefined;
  }

  return {
    mercado:    ctx.mercado,
    cfjm:       ctx.cfjm,
    level:      ctx.level,
    levelLabel: ctx.levelLabel,
    gm: gm!, tm: tm!, rm: rm!, dnm: dnm!,
    prLoss: prLoss!, cvmBase: cvmBase!, cvmCot: cvmCot!,
    cuvm: cuvm!, cuPlusCot: cuPlusCot!,
    resEstr1: layout.resEstr1 ? sheet.num(`${layout.resEstr1}${r}`) : undefined,
    resEstr2: layout.resEstr2 ? sheet.num(`${layout.resEstr2}${r}`) : undefined,
    resEstr3: layout.resEstr3 ? sheet.num(`${layout.resEstr3}${r}`) : undefined,
  };
}
