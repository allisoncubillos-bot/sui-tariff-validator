/**
 * Capa fina sobre ExcelJS que devuelve la hoja activa y utilidades
 * para acceso defensivo a celdas. El resto del sistema NO debe importar
 * ExcelJS directamente; siempre va por aquí.
 */

import ExcelJS from "exceljs";

export interface SheetSnapshot {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  rowCount: number;
  columnCount: number;
  /** Lee celda por dirección ("A4"). Devuelve undefined si vacía. */
  cell: (addr: string) => CellValue;
  /** Lee celda por (row, col) base 1. */
  cellAt: (row: number, col: number) => CellValue;
  /** Texto plano de la celda (concatenando rich text si aplica). */
  text: (addr: string) => string;
  /** Devuelve el valor numérico si lo es; undefined en otro caso. */
  num: (addr: string) => number | undefined;
}

export type CellValue = string | number | Date | boolean | null | undefined;

/**
 * Acepta tanto un path (Node) como un buffer (browser).
 *  - string         → `wb.xlsx.readFile(...)` (solo Node)
 *  - ArrayBuffer    → `wb.xlsx.load(...)`     (browser/Node)
 *  - Uint8Array     → idem
 *  - Blob / File    → `await blob.arrayBuffer()` → `wb.xlsx.load(...)`
 */
export type XlsxInput = string | ArrayBuffer | Uint8Array | Blob;

export async function readXlsx(input: XlsxInput, sheetIndex = 0): Promise<SheetSnapshot> {
  const wb = new ExcelJS.Workbook();
  if (typeof input === "string") {
    await wb.xlsx.readFile(input);
  } else if (input instanceof Uint8Array) {
    await wb.xlsx.load(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer);
  } else if (typeof Blob !== "undefined" && input instanceof Blob) {
    const buf = await input.arrayBuffer();
    await wb.xlsx.load(buf);
  } else {
    await wb.xlsx.load(input as ArrayBuffer);
  }
  const ws = wb.worksheets[sheetIndex];
  if (!ws) throw new Error(`No existe la hoja índice ${sheetIndex}`);

  /** Devuelve undefined si la celda es una "esclava" de un rango combinado. */
  const isMergeSlave = (c: ExcelJS.Cell): boolean => {
    // En ExcelJS, las celdas internas de un rango merged tienen type=Merge;
    // la celda master conserva su tipo original (String/Number/…).
    return c.type === ExcelJS.ValueType.Merge;
  };

  const cell = (addr: string): CellValue => {
    const c = ws.getCell(addr);
    if (isMergeSlave(c)) return undefined;
    return extract(c.value);
  };
  const cellAt = (row: number, col: number): CellValue => {
    const c = ws.getRow(row).getCell(col);
    if (isMergeSlave(c)) return undefined;
    return extract(c.value);
  };
  const text = (addr: string): string => {
    const c = ws.getCell(addr);
    if (isMergeSlave(c)) return "";
    const v = c.value;
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return String(v);
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object" && "richText" in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((r: any) => r.text).join("");
    }
    if (typeof v === "object" && "text" in v) return String((v as any).text);
    if (typeof v === "object" && "result" in v) return String((v as any).result);
    return String(v);
  };
  const num = (addr: string): number | undefined => {
    const v = cell(addr);
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };

  return {
    workbook: wb,
    worksheet: ws,
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
    cell,
    cellAt,
    text,
    num,
  };
}

/** Convierte un valor de ExcelJS en CellValue primitivo. */
function extract(v: ExcelJS.CellValue | undefined): CellValue {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  // ExcelJS rich text { richText: [{text}] }
  if (typeof v === "object") {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((r: any) => r.text).join("");
    if ("text" in o) return String(o.text);
    if ("result" in o && o.result != null) return extract(o.result as any);
    if ("formula" in o) return undefined; // no resolvemos fórmulas no calculadas
    if ("hyperlink" in o && "text" in o) return String(o.text);
  }
  return String(v);
}

/** Convierte letras de columna A,B,...,AA,... a índice 1-based. */
export function colToNum(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Convierte índice 1-based a letras de columna. */
export function numToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function addr(row: number, col: number): string {
  return `${numToCol(col)}${row}`;
}
