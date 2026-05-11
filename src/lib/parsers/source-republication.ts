/**
 * Parser del Excel ORIGEN de republicación.
 *
 * Misma estructura visual que el publication source, pero con MENOS mercados
 * (solo los que se republicaron). Estructura de las columnas:
 *   - Tm y Rm,i ahora están PER-ROW (columnas D y E) porque cada mercado puede
 *     tener un Tm/Rm distinto en la republicación (corrección puntual).
 *   - El layout debería ser: A=mercado, B=nivel, C=Gm, D=Tm, E=Rm, F=Dm,
 *     G=PR (o Cvm), H=CU, I=CU+COT, etc.
 *
 * El archivo 2026-04 republica 2 mercados: BOYACÁ y CARIBE SOL. Esa lista de
 * mercados es lo que decide qué filas del T4/T8 final cambian respecto al
 * T3/T7 original.
 */

import { readXlsx, type SheetSnapshot, type XlsxInput } from "./xlsx-reader.js";
import { toLevelCode } from "../domain/niveles.js";
import { NUMERIC_TOLERANCE } from "../domain/constants.js";
import type {
  SourceWorkbook,
  SourceRow,
  ParseDiagnostic,
  LevelCode,
  LevelLabel,
} from "../types.js";

/**
 * Layout específico de la republicación (verificado con 2026-04).
 *
 *   A → MERCADO\nCfm.j
 *   B → nivel
 *   C → Gm
 *   D → Tm           (per-row, NO global)
 *   E → Rm,i         (per-row, varía por nivel)
 *   F → Dm
 *   G → Cvm + COT    (o Cvm si la columna G del visual lo lleva)
 *   H → CU
 *   I → CU + COT     (= Tarifa N1)
 *   J → CU + Contrib
 *   K → CU + COT + Contrib
 */
export const REPUBLICATION_LAYOUT = {
  gm: "C", tm: "D", rm: "E", dnm: "F", cvmCot: "G",
  cuvm: "H", cuPlusCot: "I", resCu: "J", resCuCot: "K",
} as const;

/**
 * En el visual de republicación NO hay columna explícita de Cvm aislada;
 * el solver lo deriva: Cvm = CU − (Gm + Tm + Rm + Dm + PR).
 * PR_nm se obtiene también por despeje si no hay columna directa, asumiendo
 * Cvm conocido por catálogo de comercializador. Para BIA, el Cvm es constante
 * por mercado/mes y lo tomamos del archivo de publicación previo (si está).
 */

export async function parseRepublicationSource(
  input: XlsxInput,
): Promise<SourceWorkbook> {
  const sheet = await readXlsx(input);
  const diagnostics: ParseDiagnostic[] = [];
  const headerRow = findHeaderRow(sheet, diagnostics);

  const rows: SourceRow[] = [];
  const mercados: string[] = [];

  let activeMercado: string | undefined;
  let activeCfjm: number | undefined;

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const aText = sheet.text(`A${r}`);
    const mercadoBlock = parseMercadoCell(aText);

    if (mercadoBlock) {
      activeMercado = mercadoBlock.mercado;
      activeCfjm = mercadoBlock.cfjm;
      mercados.push(activeMercado);
    }
    if (!activeMercado || activeCfjm == null) continue;

    const levelCode = toLevelCode(sheet.cell(`B${r}`));
    if (!levelCode) {
      if (isNoteOrFooter(aText)) break;
      continue;
    }

    const gm   = sheet.num(`${REPUBLICATION_LAYOUT.gm}${r}`);
    const tm   = sheet.num(`${REPUBLICATION_LAYOUT.tm}${r}`);
    const rm   = sheet.num(`${REPUBLICATION_LAYOUT.rm}${r}`);
    const dnm  = sheet.num(`${REPUBLICATION_LAYOUT.dnm}${r}`);
    const cuvm = sheet.num(`${REPUBLICATION_LAYOUT.cuvm}${r}`);
    const cuPlusCot = sheet.num(`${REPUBLICATION_LAYOUT.cuPlusCot}${r}`);

    if ([gm, tm, rm, dnm, cuvm, cuPlusCot].some((v) => v == null)) {
      diagnostics.push({
        level: "warn",
        code: "ROW_INCOMPLETE_REPUB",
        message: `Fila ${r} de republicación incompleta — se omite.`,
        mercado: activeMercado, cellRef: `${r}`,
      });
      continue;
    }

    // En la republicación 2026-04, el visual NO trae Cvm base y Cvm+COT en
    // columnas separadas — solo trae:
    //   col F = Dm,  col G = PR_nm (== valor que en publication es "Cvm base"
    //           en la convención BIA, pero ojo: aquí su NOMBRE en el header es
    //           "PR nm" y el VALOR es el margen Cvm).
    // Para mantener la equivalencia con el publication source, asignamos:
    //   cvmBase ← col G,  cvmCot ← derivado (Cvm+COT = CU+COT - CU + cvmBase)
    const cvmBaseVal = sheet.num(`${REPUBLICATION_LAYOUT.cvmCot}${r}`) ?? 0;
    // CU+COT - CU = COT_per_kWh. cvmCot = cvmBase + COT_on_Cvm. Sin un breakdown
    // explícito, asumimos cvmCot ≈ cvmBase + (CU+COT - CU). Es una aproximación
    // y se emite un warning cuando no cierra la identidad.
    const cot = cuPlusCot! - cuvm!;
    const cvmBase = cvmBaseVal;
    const cvmCot  = cvmBaseVal + cot;
    // prLoss (literal pérdidas) lo derivamos: CU - (Gm+Tm+Rm+Dm+Cvm_base)
    const prLoss = cuvm! - (gm! + tm! + rm! + dnm! + cvmBase);

    rows.push({
      mercado: activeMercado,
      cfjm: activeCfjm,
      level: levelCode,
      levelLabel: codeToVisualLabel(levelCode),
      gm: gm!, tm: tm!, rm: rm!, dnm: dnm!,
      prLoss, cvmBase, cvmCot,
      cuvm: cuvm!, cuPlusCot: cuPlusCot!,
    });

    // Sanity check: CU+COT debería igualar Gm+Tm+Rm+Dm+cvmBase+cvmCot
    const sumOK = Math.abs((gm! + tm! + rm! + dnm! + cvmBase + cvmCot) - cuPlusCot!) < NUMERIC_TOLERANCE * 100;
    if (!sumOK) {
      diagnostics.push({
        level: "warn",
        code: "REPUB_CU_DERIVED",
        message: `Componentes de ${activeMercado} nivel ${levelCode} se derivaron por despeje; verificá manualmente.`,
        mercado: activeMercado,
      });
    }
  }

  return {
    period: extractPeriod(sheet),
    isRepublication: true,
    rows,
    mercados,
    diagnostics,
  };
}

/* helpers locales (duplicados de source-publication para mantenerlo aislado) */

function findHeaderRow(sheet: SheetSnapshot, diag: ParseDiagnostic[]): number {
  for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
    const a = String(sheet.text(`A${r}`) ?? "").trim().toUpperCase();
    if (a === "MERCADO") return r;
  }
  diag.push({ level: "warn", code: "HEADER_NOT_FOUND", message: "Header 'MERCADO' no hallado; asumo fila 3." });
  return 3;
}

function parseMercadoCell(text: string): { mercado: string; cfjm: number } | undefined {
  if (!text) return undefined;
  const m = text.match(/Cfm\.?\s*j\s*([\d.,]+)/i);
  if (!m) return undefined;
  const cfjm = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(cfjm)) return undefined;
  const mercado = text.replace(m[0], "").replace(/[\s\n\r]+/g, " ").trim();
  return mercado ? { mercado, cfjm } : undefined;
}

function isNoteOrFooter(text: string): boolean {
  const up = (text || "").toUpperCase();
  return up.includes("NOTA") || up.includes("VIGILADA") || up.includes("REPUBLICACIÓN");
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

function extractPeriod(sheet: SheetSnapshot): { year: number; month: number; label: string } {
  const MONTHS: Record<string, number> = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
  };
  for (let r = 1; r <= 20; r++) {
    for (let c = 1; c <= sheet.columnCount; c++) {
      const t = String(sheet.cellAt(r, c) ?? "").toUpperCase();
      const m = t.match(/(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(?:DE\s+)?(\d{4})/);
      if (m) return { year: Number(m[2]), month: MONTHS[m[1]!]!, label: `${m[1]} de ${m[2]}` };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, label: now.toISOString().slice(0, 7) };
}
