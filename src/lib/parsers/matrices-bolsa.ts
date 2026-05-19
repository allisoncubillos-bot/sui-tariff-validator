/**
 * Parsers de las matrices horarias de bolsa (XM) — fuente de CB MNR y VCB MNR
 * en el T9.
 *
 * Dos archivos:
 *   - precio bolsa.xlsx — matriz diaria × 24 horas, una sola serie global (no
 *     se desagrega por mercado). Headers: file_date, version_file, H1..H24.
 *   - cantidad compras bolsa.xlsx — matriz diaria × 24 horas, filtrada por
 *     concept='COMPRAS EN BOLSA' + market='NO REGULADO'. Headers:
 *     file_date, version_name, concept, market, contract_code, buyer, seller,
 *     dispatch_type, assignments_type, h_1..h_24.
 *
 * El generador T9 espera dos escalares (idénticos para los 20 mercados):
 *   - CB MNR  = Σ cantidad[día][hora]              (kWh)
 *   - VCB MNR = Σ precio[día][hora] × cantidad[día][hora]  ($)
 *
 * Si los archivos cubren un mes distinto al período seleccionado por el
 * usuario, este parser igual los suma — la responsabilidad de validar el
 * período es de la UI / api.ts.
 */

import { readXlsx, type XlsxInput } from "./xlsx-reader.js";
import type { ParseDiagnostic } from "../types.js";

const HOURS = Array.from({ length: 24 }, (_, i) => i + 1);

interface DayMatrix {
  /** ISO date YYYY-MM-DD. */
  date: string;
  /** Valores hora 1..24, 0 si la celda venía vacía o no era número. */
  values: number[];
}

export interface BolsaMatrix {
  days: DayMatrix[];
  /** Periodo cubierto, derivado de las fechas. */
  period?: { year: number; month: number; label: string };
  diagnostics: ParseDiagnostic[];
}

/**
 * Convierte cualquier valor de celda a número. Maneja:
 *   - number directo                  → tal cual
 *   - string "3850.75"                → 3850.75
 *   - string "3,850.75" (en-US, miles)→ 3850.75
 *   - string "3.850,75" (es-CO, miles)→ 3850.75
 *   - string "3,75" (decimal coma)    → 3.75
 *   - vacío/null/undefined/NaN        → 0
 *
 * Esta función es CRÍTICA: si una celda del xlsx llega como string (lo cual
 * pasa cuando la celda está formateada como texto, o cuando Excel guarda
 * números con separadores explícitos), el T9 sumaba 0 y CB MNR/VCB MNR
 * salían en 0 aunque las matrices estuvieran correctas.
 */
function toNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;

  let s = v.trim();
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot   = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // Ambos separadores → el último es el decimal.
    if (lastDot > lastComma) {
      // "3,850.75" — coma=miles, punto=decimal. Quita comas.
      s = s.replace(/,/g, "");
    } else {
      // "3.850,75" — punto=miles, coma=decimal. Quita puntos y cambia coma por punto.
      s = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (lastComma >= 0) {
    // Solo coma. Decidir si es decimal o separador de miles.
    const commaCount = (s.match(/,/g) ?? []).length;
    const afterComma = s.length - lastComma - 1;
    if (commaCount === 1 && afterComma <= 2) {
      // "3,75" — decimal europea.
      s = s.replace(",", ".");
    } else {
      // "3,850,123" — separador de miles inglés sin decimales.
      s = s.replace(/,/g, "");
    }
  }
  // Solo punto o sin separador → ya es válido como Number().

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Detecta columnas hora en una fila de headers. Acepta variantes "H1", "h_1",
 * "H_1", "Hora 1". Devuelve un array de 24 índices de columna (1-based) en
 * orden hora 1 → hora 24.
 */
function findHourColumns(snap: { columnCount: number; cellAt: (r: number, c: number) => unknown }): number[] {
  const found = new Map<number, number>(); // hour → col
  for (let c = 1; c <= snap.columnCount; c++) {
    const v = snap.cellAt(1, c);
    if (typeof v !== "string") continue;
    // Acepta "h1", "h_1", "h 1", "hora 1", "hour 1".
    const lower = v.trim().toLowerCase();
    const m = lower.match(/^h(?:our|ora)?[\s_]*(\d{1,2})$/);
    if (m) {
      const h = Number(m[1]);
      if (h >= 1 && h <= 24 && !found.has(h)) found.set(h, c);
    }
  }
  return HOURS.map((h) => found.get(h) ?? -1);
}

function findColByHeader(snap: { columnCount: number; cellAt: (r: number, c: number) => unknown }, name: string): number {
  for (let c = 1; c <= snap.columnCount; c++) {
    const v = snap.cellAt(1, c);
    if (typeof v === "string" && v.trim().toLowerCase() === name.toLowerCase()) return c;
  }
  return -1;
}

/**
 * Parser de fechas. Maneja:
 *   - Date object                          → tal cual
 *   - string ISO ("2026-04-01...")          → Date
 *   - string en español ("abril 1, 2026")   → Date
 *   - number Excel serial (días desde 1900) → Date
 */
function parseDate(v: unknown): Date | undefined {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date: días desde 1900-01-01 (con bug del 29-feb-1900).
    // Convertimos asumiendo el sistema 1900 estándar.
    const epoch = Date.UTC(1899, 11, 30); // 30-dic-1899 + serial = fecha real
    return new Date(epoch + v * 86400000);
  }
  if (typeof v === "string") {
    const s = v.trim();
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
    // Fallback: español "abril 1, 2026, 12:00 AM"
    const spanishMonths: Record<string, number> = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    };
    const m = s.toLowerCase().match(/^([a-záéíóú]+)\s+(\d{1,2}),?\s*(\d{4})/);
    if (m) {
      const month = spanishMonths[m[1]!];
      if (month !== undefined) {
        return new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
      }
    }
  }
  return undefined;
}

async function parseMatrix(input: XlsxInput, opts: { kind: "precio" | "cantidad" }): Promise<BolsaMatrix> {
  const snap = await readXlsx(input, 0);
  const diagnostics: ParseDiagnostic[] = [];

  const dateCol = findColByHeader(snap, "file_date");
  if (dateCol < 0) throw new Error(`Matriz ${opts.kind}: columna 'file_date' no encontrada`);
  const hourCols = findHourColumns(snap);
  const missing = hourCols.filter((c) => c < 0).length;
  if (missing > 0) {
    throw new Error(`Matriz ${opts.kind}: faltan ${missing} columnas de hora (H1..H24)`);
  }

  const days: DayMatrix[] = [];
  const monthCounts = new Map<string, number>();
  let skippedRows = 0;
  let totalSum = 0;

  for (let r = 2; r <= snap.rowCount; r++) {
    const d = parseDate(snap.cellAt(r, dateCol));
    if (!d) { skippedRows++; continue; }
    const values: number[] = [];
    let rowSum = 0;
    for (const hc of hourCols) {
      const n = toNumber(snap.cellAt(r, hc));
      values.push(n);
      rowSum += n;
    }
    totalSum += rowSum;
    days.push({ date: d.toISOString().slice(0, 10), values });
    const monthKey = d.toISOString().slice(0, 7);
    monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
  }

  // Log de diagnóstico — visible en DevTools del navegador.
  // Útil para detectar si el parser leyó 0 filas o 0 valores cuando se esperaba data.
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.log(`[bolsa:${opts.kind}] filas leídas=${days.length}, filas omitidas=${skippedRows}, suma total=${totalSum}`);
  }

  if (days.length === 0) {
    diagnostics.push({
      level: "error",
      code: `matrix.${opts.kind}.empty`,
      message: `Matriz ${opts.kind}: 0 filas leídas (${skippedRows} omitidas por fecha inválida). Verifica el formato del archivo.`,
    });
  } else if (totalSum === 0) {
    diagnostics.push({
      level: "warn",
      code: `matrix.${opts.kind}.allZeros`,
      message: `Matriz ${opts.kind}: ${days.length} filas leídas pero suma total = 0. Posible problema de formato (celdas tipo texto en vez de número).`,
    });
  } else {
    diagnostics.push({
      level: "info",
      code: `matrix.${opts.kind}.ok`,
      message: `Matriz ${opts.kind}: ${days.length} días leídos, suma=${totalSum.toLocaleString("en-US", { maximumFractionDigits: 2 })}.`,
    });
  }

  let period: BolsaMatrix["period"];
  if (monthCounts.size) {
    const [label] = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const [y, m] = label.split("-");
    period = { year: Number(y), month: Number(m), label };
    if (monthCounts.size > 1) {
      diagnostics.push({
        level: "warn",
        code: "matrix.multiMonth",
        message: `Matriz ${opts.kind} cubre más de un mes: ${[...monthCounts.keys()].join(", ")}`,
      });
    }
  }

  return { days, period, diagnostics };
}

export function parsePrecioBolsa(input: XlsxInput): Promise<BolsaMatrix> {
  return parseMatrix(input, { kind: "precio" });
}

export function parseCantidadBolsa(input: XlsxInput): Promise<BolsaMatrix> {
  return parseMatrix(input, { kind: "cantidad" });
}

/**
 * Combina cantidad+precio en los dos escalares que necesita el T9.
 *
 * Algoritmo: indexamos precios por fecha; por cada día de cantidad, si existe
 * el día en precios → multiplicamos hora-a-hora; si no, emitimos diagnóstico
 * y sumamos solo la cantidad (sin contribución a VCB MNR para ese día).
 */
export interface AggregatedBolsa {
  /** Σ cantidad — para CB MNR (kWh). */
  cbMnr: number;
  /** Σ precio × cantidad — para VCB MNR ($). */
  vcbMnr: number;
  /** Días procesados. */
  daysCount: number;
  diagnostics: ParseDiagnostic[];
}

export function aggregateBolsa(
  cantidad: BolsaMatrix,
  precio: BolsaMatrix,
): AggregatedBolsa {
  const diagnostics: ParseDiagnostic[] = [];
  const precioByDate = new Map(precio.days.map((d) => [d.date, d.values]));

  let cbMnr = 0;
  let vcbMnr = 0;
  let daysCount = 0;
  const missingDates: string[] = [];

  for (const day of cantidad.days) {
    daysCount++;
    const pVals = precioByDate.get(day.date);
    for (let h = 0; h < 24; h++) {
      const q = day.values[h] ?? 0;
      cbMnr += q;
      if (pVals) {
        vcbMnr += q * (pVals[h] ?? 0);
      }
    }
    if (!pVals) missingDates.push(day.date);
  }

  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.log(`[bolsa:aggregate] daysCount=${daysCount}, cbMnr=${cbMnr}, vcbMnr=${vcbMnr}, fechas sin precio=${missingDates.length}`);
  }

  if (missingDates.length) {
    diagnostics.push({
      level: "warn",
      code: "bolsa.priceMissingForDay",
      message: `Sin precio bolsa para ${missingDates.length} día(s): ${missingDates.slice(0, 5).join(", ")}${missingDates.length > 5 ? "…" : ""}. VCB MNR queda subestimado.`,
    });
  }
  // Días con precio pero sin cantidad — informativo, no error.
  const cantidadDates = new Set(cantidad.days.map((d) => d.date));
  const extraPriceDays = precio.days.filter((d) => !cantidadDates.has(d.date)).map((d) => d.date);
  if (extraPriceDays.length) {
    diagnostics.push({
      level: "info",
      code: "bolsa.extraPriceDays",
      message: `Precio bolsa tiene ${extraPriceDays.length} día(s) sin cantidad — se ignoran.`,
    });
  }

  return { cbMnr, vcbMnr, daysCount, diagnostics };
}
