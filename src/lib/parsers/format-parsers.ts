/**
 * Parsers de los formatos SUI ya armados (T3, T4, T7, T8).
 *
 * Estos NO confían en los nombres de los headers — leen por POSICIÓN
 * (columnas A, B, C, ...) ya que la spec del SUI fija el orden. Sin embargo,
 * después de leer los datos, comparamos los headers leídos contra los oficiales
 * y emitimos diagnóstico si difieren (problema "etiquetas cruzadas").
 */

import { readXlsx, type SheetSnapshot, type XlsxInput } from "./xlsx-reader.js";
import type { T3Row, T4Row, T7Row, T8Row, ParseDiagnostic } from "../types.js";
import { toLevelCode } from "../domain/niveles.js";

export interface FormatParseResult<T> {
  rows: T[];
  diagnostics: ParseDiagnostic[];
  /** Headers tal como aparecían en el archivo. */
  headersRead: (string | undefined)[];
}

/* ───── headers oficiales (SUI / lineamientos) ───── */

/**
 * Headers OFICIALES del T3 según los archivos aceptados por el SUI.
 *
 * Atención al orden de columnas I/J/K — el SUI las publica como
 *   I = "Tarifa Nivel 1 100% OR"
 *   J = "Tarifa Nivel 1 0% OR"     ← ¡no es 50%!
 *   K = "Tarifa Nivel 1 50% OR"
 *
 * Esto NO coincide con el orden 100/50/0 de las columnas F/G/H (% subsidio).
 * Es una particularidad de la spec — mantener este orden invertido es lo que
 * acepta el cargue masivo.
 */
export const T3_HEADERS = [
  "city_code", "Cargo Horario", "Inicio Franja Horaria", "Fin Franja Horaria",
  "Estrato / Sector",
  "% Subsidiado 100% OR", "% Subsidiado 50% OR", "% Subsidiado 0% OR",
  "Tarifa Nivel 1 100% OR", "Tarifa Nivel 1 0% OR", "Tarifa Nivel 1 50% OR",
  "Tarifa Nivel 2", "Tarifa Nivel 3", "Tarifa Nivel 4",
  "Cfjm", "Fecha Publicación", "Diario de Publicacion", "Tarifa OT",
];

export const T7_HEADERS = [
  "city_code", "level", "gm", "tm", "rm", "dnm", "prnm", "cvm", "cuvm", "cargo_horario",
];

export async function parseT3(input: XlsxInput): Promise<FormatParseResult<T3Row>> {
  const sheet = await readXlsx(input);
  const diag: ParseDiagnostic[] = [];
  const headersRead = readHeaderRow(sheet, 18);
  diffHeaders("T3", headersRead, T3_HEADERS, diag);

  const rows: T3Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (isRowEmpty(sheet, r, 18)) continue;
    const row = toT3Row(sheet, r, diag);
    if (row) rows.push(row);
  }
  return { rows, diagnostics: diag, headersRead };
}

export async function parseT4(input: XlsxInput): Promise<FormatParseResult<T4Row>> {
  // Spec lineamientos: 20 columnas (con Año/Mes Corregido).
  // Spec real observada en archivos enviados: 18 columnas (idéntico a T3).
  // Detectamos automáticamente.
  const sheet = await readXlsx(input);
  const diag: ParseDiagnostic[] = [];
  const has20 = countNonEmptyHeaderCells(sheet) >= 20;
  const headersRead = readHeaderRow(sheet, has20 ? 20 : 18);
  diag.push({
    level: has20 ? "info" : "warn",
    code: "T4_LAYOUT",
    message: has20
      ? "T4 detectado con 20 columnas (incluye Año/Mes Corregido)."
      : "T4 detectado con 18 columnas (sin Año/Mes Corregido); coincide con el draft enviado al SUI.",
  });

  const rows: T4Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (isRowEmpty(sheet, r, has20 ? 20 : 18)) continue;
    const row = toT4Row(sheet, r, has20, diag);
    if (row) rows.push(row);
  }
  return { rows, diagnostics: diag, headersRead };
}

export async function parseT7(input: XlsxInput): Promise<FormatParseResult<T7Row>> {
  const sheet = await readXlsx(input);
  const diag: ParseDiagnostic[] = [];
  const headersRead = readHeaderRow(sheet, 10);
  diffHeaders("T7", headersRead, T7_HEADERS, diag);

  const rows: T7Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (isRowEmpty(sheet, r, 10)) continue;
    const row = toT7Row(sheet, r, diag);
    if (row) rows.push(row);
  }
  return { rows, diagnostics: diag, headersRead };
}

export async function parseT8(input: XlsxInput): Promise<FormatParseResult<T8Row>> {
  const sheet = await readXlsx(input);
  const diag: ParseDiagnostic[] = [];
  const has12 = countNonEmptyHeaderCells(sheet) >= 12;
  const headersRead = readHeaderRow(sheet, has12 ? 12 : 10);
  diag.push({
    level: has12 ? "info" : "warn",
    code: "T8_LAYOUT",
    message: has12
      ? "T8 detectado con 12 columnas (incluye Año/Mes Corregido)."
      : "T8 detectado con 10 columnas (sin Año/Mes Corregido); coincide con draft enviado al SUI.",
  });

  const rows: T8Row[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    if (isRowEmpty(sheet, r, has12 ? 12 : 10)) continue;
    const row = toT8Row(sheet, r, has12, diag);
    if (row) rows.push(row);
  }
  return { rows, diagnostics: diag, headersRead };
}

/* ─────────────────── coercers ─────────────────── */

function toT3Row(sheet: SheetSnapshot, r: number, diag: ParseDiagnostic[]): T3Row | undefined {
  const cityCode = mustNum(sheet, `A${r}`, "city_code", diag);
  const cargoHorario = mustNum(sheet, `B${r}`, "cargo_horario", diag);
  if (cityCode == null || cargoHorario == null) return undefined;
  return {
    cityCode, cargoHorario,
    inicioFranja: String(sheet.cell(`C${r}`) ?? "00:00"),
    finFranja:    String(sheet.cell(`D${r}`) ?? "23:59"),
    estrato:    mustNum(sheet, `E${r}`, "estrato",  diag) ?? 0,
    pctSub100:  mustNum(sheet, `F${r}`, "pctSub100", diag) ?? 0,
    pctSub50:   mustNum(sheet, `G${r}`, "pctSub50",  diag) ?? 0,
    pctSub0:    mustNum(sheet, `H${r}`, "pctSub0",   diag) ?? 0,
    tarifaN1_100: mustNum(sheet, `I${r}`, "tarifaN1_100", diag) ?? 0,
    // OJO: la spec del SUI invierte el orden de las cols J/K respecto a F/G/H
    tarifaN1_0:   mustNum(sheet, `J${r}`, "tarifaN1_0",   diag) ?? 0,
    tarifaN1_50:  mustNum(sheet, `K${r}`, "tarifaN1_50",  diag) ?? 0,
    tarifaN2: mustNum(sheet, `L${r}`, "tarifaN2", diag) ?? 0,
    tarifaN3: mustNum(sheet, `M${r}`, "tarifaN3", diag) ?? 0,
    tarifaN4: mustNum(sheet, `N${r}`, "tarifaN4", diag) ?? 0,
    cfjm:     mustNum(sheet, `O${r}`, "cfjm",     diag) ?? 0,
    fechaPublicacion: coerceDate(sheet.cell(`P${r}`)) ?? new Date(),
    diarioPublicacion: String(sheet.cell(`Q${r}`) ?? ""),
    tarifaOT: mustNum(sheet, `R${r}`, "tarifaOT", diag) ?? 2,
  };
}

function toT4Row(sheet: SheetSnapshot, r: number, has20: boolean, diag: ParseDiagnostic[]): T4Row | undefined {
  if (!has20) {
    const base = toT3Row(sheet, r, diag);
    return base ? (base as T4Row) : undefined;
  }
  const cityCode = mustNum(sheet, `A${r}`, "city_code", diag);
  if (cityCode == null) return undefined;
  return {
    cityCode,
    anioCorregido: mustNum(sheet, `B${r}`, "anio_corregido", diag),
    mesCorregido:  mustNum(sheet, `C${r}`, "mes_corregido",  diag),
    cargoHorario:  mustNum(sheet, `D${r}`, "cargo_horario",  diag) ?? 4,
    inicioFranja: String(sheet.cell(`E${r}`) ?? "00:00"),
    finFranja:    String(sheet.cell(`F${r}`) ?? "23:59"),
    estrato:    mustNum(sheet, `G${r}`, "estrato",  diag) ?? 0,
    pctSub100:  mustNum(sheet, `H${r}`, "pctSub100", diag) ?? 0,
    pctSub50:   mustNum(sheet, `I${r}`, "pctSub50",  diag) ?? 0,
    pctSub0:    mustNum(sheet, `J${r}`, "pctSub0",   diag) ?? 0,
    tarifaN1_100: mustNum(sheet, `K${r}`, "tarifaN1_100", diag) ?? 0,
    // mismo orden invertido del T3 (ver T3_HEADERS)
    tarifaN1_0:   mustNum(sheet, `L${r}`, "tarifaN1_0",  diag) ?? 0,
    tarifaN1_50:  mustNum(sheet, `M${r}`, "tarifaN1_50",   diag) ?? 0,
    tarifaN2: mustNum(sheet, `N${r}`, "tarifaN2", diag) ?? 0,
    tarifaN3: mustNum(sheet, `O${r}`, "tarifaN3", diag) ?? 0,
    tarifaN4: mustNum(sheet, `P${r}`, "tarifaN4", diag) ?? 0,
    cfjm:     mustNum(sheet, `Q${r}`, "cfjm",     diag) ?? 0,
    fechaPublicacion: coerceDate(sheet.cell(`R${r}`)) ?? new Date(),
    diarioPublicacion: String(sheet.cell(`S${r}`) ?? ""),
    tarifaOT: mustNum(sheet, `T${r}`, "tarifaOT", diag) ?? 2,
  };
}

function toT7Row(sheet: SheetSnapshot, r: number, diag: ParseDiagnostic[]): T7Row | undefined {
  const cityCode = mustNum(sheet, `A${r}`, "city_code", diag);
  const level = toLevelCode(sheet.cell(`B${r}`));
  if (cityCode == null || !level) return undefined;
  return {
    cityCode, level,
    gm:    mustNum(sheet, `C${r}`, "gm",   diag) ?? 0,
    tm:    mustNum(sheet, `D${r}`, "tm",   diag) ?? 0,
    rm:    mustNum(sheet, `E${r}`, "rm",   diag) ?? 0,
    dnm:   mustNum(sheet, `F${r}`, "dnm",  diag) ?? 0,
    prnm:  mustNum(sheet, `G${r}`, "prnm", diag) ?? 0,
    cvm:   mustNum(sheet, `H${r}`, "cvm",  diag) ?? 0,
    cuvm:  mustNum(sheet, `I${r}`, "cuvm", diag) ?? 0,
    cargoHorario: mustNum(sheet, `J${r}`, "cargo_horario", diag) ?? 4,
  };
}

function toT8Row(sheet: SheetSnapshot, r: number, has12: boolean, diag: ParseDiagnostic[]): T8Row | undefined {
  if (!has12) {
    const base = toT7Row(sheet, r, diag);
    return base ? (base as T8Row) : undefined;
  }
  const cityCode = mustNum(sheet, `A${r}`, "city_code", diag);
  const level = toLevelCode(sheet.cell(`D${r}`)); // ojo: con 12 cols el level pasa a col D
  if (cityCode == null || !level) return undefined;
  return {
    cityCode,
    anioCorregido: mustNum(sheet, `B${r}`, "anio_corregido", diag),
    mesCorregido:  mustNum(sheet, `C${r}`, "mes_corregido",  diag),
    level,
    gm:   mustNum(sheet, `E${r}`, "gm",   diag) ?? 0,
    tm:   mustNum(sheet, `F${r}`, "tm",   diag) ?? 0,
    rm:   mustNum(sheet, `G${r}`, "rm",   diag) ?? 0,
    dnm:  mustNum(sheet, `H${r}`, "dnm",  diag) ?? 0,
    prnm: mustNum(sheet, `I${r}`, "prnm", diag) ?? 0,
    cvm:  mustNum(sheet, `J${r}`, "cvm",  diag) ?? 0,
    cuvm: mustNum(sheet, `K${r}`, "cuvm", diag) ?? 0,
    cargoHorario: mustNum(sheet, `L${r}`, "cargo_horario", diag) ?? 4,
  };
}

/* ─────────────────── utilidades ─────────────────── */

function readHeaderRow(sheet: SheetSnapshot, cols: number): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  for (let c = 1; c <= cols; c++) {
    const v = sheet.cellAt(1, c);
    out.push(v == null ? undefined : String(v));
  }
  return out;
}

function diffHeaders(format: string, read: (string | undefined)[], expected: string[], diag: ParseDiagnostic[]) {
  for (let i = 0; i < expected.length; i++) {
    const a = (read[i] ?? "").trim().toLowerCase();
    const b = expected[i]!.trim().toLowerCase();
    if (a !== b) {
      diag.push({
        level: "warn",
        code: "HEADER_MISMATCH",
        message: `${format} columna ${i + 1}: leído "${read[i] ?? ""}" vs esperado "${expected[i]}".`,
        cellRef: `R1C${i + 1}`,
      });
    }
  }
}

function countNonEmptyHeaderCells(sheet: SheetSnapshot): number {
  let n = 0;
  for (let c = 1; c <= sheet.columnCount; c++) {
    if (sheet.cellAt(1, c) != null && String(sheet.cellAt(1, c)).trim() !== "") n++;
  }
  return n;
}

function isRowEmpty(sheet: SheetSnapshot, r: number, ncols: number): boolean {
  for (let c = 1; c <= ncols; c++) {
    const v = sheet.cellAt(r, c);
    if (v != null && String(v).trim() !== "") return false;
  }
  return true;
}

function mustNum(sheet: SheetSnapshot, addr: string, field: string, diag: ParseDiagnostic[]): number | undefined {
  const v = sheet.cell(addr);
  if (v == null) return undefined;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  diag.push({ level: "warn", code: "TYPE_NUMBER", message: `${field} en ${addr} no es numérico: ${JSON.stringify(v)}`, cellRef: addr });
  return undefined;
}

function coerceDate(v: unknown): Date | undefined {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // serial date Excel (1900-based, with the leap bug)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400000);
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return undefined;
}
