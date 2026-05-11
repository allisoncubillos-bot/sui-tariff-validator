/**
 * Escritor XLSX universal: dada una spec y filas, produce el archivo final
 * con headers oficiales, tipos correctos y 5 decimales de precisión donde
 * corresponde.
 *
 * Decisión de diseño:
 *   - "5 decimales obligatorios" se interpreta como:
 *       1) El VALOR almacenado en la celda se redondea a 1e-5.
 *       2) El FORMATO de celda usa la máscara "0.00000".
 *     Así, abrir el archivo en Excel muestra exactamente 5 decimales y al
 *     mismo tiempo el SUI lee el valor numérico con esa precisión.
 */

import ExcelJS from "exceljs";
import type { SuiColumn } from "./format-spec.js";
import { DECIMALS } from "../domain/constants.js";

export interface WriteOptions {
  /** Si true, NO redondea; solo formatea visualmente. Default: redondea. */
  preserveRawPrecision?: boolean;
  /** Hoja a usar. Default: "Hoja1". */
  sheetName?: string;
}

/**
 * Construye el ExcelJS workbook en memoria. Reutilizado por writeXlsx (Node)
 * y writeXlsxToBuffer (browser).
 */
function buildWorkbook<T>(
  spec: SuiColumn<T>[],
  rows: T[],
  opts: WriteOptions,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  wb.creator = "BIA Energy — sui-tariff-system";

  const ws = wb.addWorksheet(opts.sheetName ?? "Hoja1");

  ws.columns = spec.map((c) => ({ header: c.header, key: String(c.field), width: c.width ?? 12 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    const obj: Record<string, unknown> = {};
    for (const col of spec) {
      const raw = col.getter ? col.getter(row) : (row as any)[col.field];
      obj[String(col.field)] = coerce(raw, col.type, !!opts.preserveRawPrecision);
    }
    ws.addRow(obj);
  }

  for (let i = 0; i < spec.length; i++) {
    const col = spec[i]!;
    const xcol = ws.getColumn(i + 1);
    switch (col.type) {
      case "decimal5": xcol.numFmt = "0.00000"; break;
      case "int":      xcol.numFmt = "0";        break;
      case "date":     xcol.numFmt = "yyyy-mm-dd"; break;
      case "time":     xcol.numFmt = "@";         break;
      case "string":   xcol.numFmt = "@";         break;
    }
  }
  return wb;
}

/**
 * Escribe a disco. Solo para entornos Node (CLI, server).
 */
export async function writeXlsx<T>(
  filePath: string,
  spec: SuiColumn<T>[],
  rows: T[],
  opts: WriteOptions = {},
): Promise<void> {
  const wb = buildWorkbook(spec, rows, opts);
  await wb.xlsx.writeFile(filePath);
}

/**
 * Genera el binario en memoria. Browser-friendly — el caller convierte el
 * Uint8Array a Blob para descargar:
 *   const buf = await writeXlsxToBuffer(spec, rows);
 *   const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
 *   const url = URL.createObjectURL(blob);
 */
export async function writeXlsxToBuffer<T>(
  spec: SuiColumn<T>[],
  rows: T[],
  opts: WriteOptions = {},
): Promise<Uint8Array> {
  const wb = buildWorkbook(spec, rows, opts);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

function coerce(raw: unknown, type: SuiColumn<any>["type"], preserve: boolean): unknown {
  if (raw == null) return type === "string" ? "" : null;
  switch (type) {
    case "decimal5": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return preserve ? n : round5(n);
    }
    case "int": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      return Math.round(n);
    }
    case "date":
      return raw instanceof Date ? raw : new Date(String(raw));
    case "time":
    case "string":
      return String(raw);
  }
}

export function round5(n: number): number {
  const f = 10 ** DECIMALS;
  return Math.round(n * f) / f;
}
