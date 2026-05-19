/**
 * Parser de la "Memoria de cálculo" — fuente principal de variables T9
 * por mercado.
 *
 * El archivo viene como exportación de query SQL en formato long:
 *   columns: city, start_date, id, rate_id, component, type_term, value, ...
 *
 * Cada fila es UN valor identificado por (city, component, type_term). Una
 * misma celda puede aparecer múltiples veces si el query trae JOINs duplicados;
 * el parser hace dedupe quedándose con el primer valor encontrado (los valores
 * duplicados siempre son idénticos en la práctica).
 *
 * El parser NO interpreta semántica — solo construye un índice
 * (city, component, type_term) → value. El generador T9 lo consume
 * sabiendo qué (component, type_term) corresponde a cada campo del SUI.
 */

import { readXlsx, type XlsxInput } from "./xlsx-reader.js";
import type { ParseDiagnostic } from "../types.js";
import { findMercadoByName } from "../domain/mercados.js";

/** Una fila de la memoria, ya normalizada. */
export interface MemoriaRow {
  /** Nombre del mercado normalizado (mayúsculas, sin tildes). */
  city: string;
  /** city_code DANE — undefined si el mercado no está en el catálogo. */
  cityCode?: number;
  /** Fecha de inicio del período (m). */
  startDate?: Date;
  /** Familia de términos: 'GenerationTerms', 'AjTerms', etc. */
  component: string;
  /** Tipo específico del valor: 'QuantityContracts', 'Alpha', 'Mc', etc. */
  typeTerm: string;
  /** Valor numérico — null si la celda estaba vacía o no era número. */
  value: number | null;
}

export interface MemoriaWorkbook {
  rows: MemoriaRow[];
  /** Índice rápido: cityCode → component → typeTerm → value. */
  index: Map<number, Map<string, Map<string, number>>>;
  /** Lista de mercados detectados (cityCode únicos). */
  cityCodes: number[];
  /** Período detectado (start_date más frecuente). */
  period?: { year: number; month: number; label: string };
  diagnostics: ParseDiagnostic[];
}

/** Headers esperados — el parser falla si no los encuentra. */
const EXPECTED_HEADERS = ["city", "start_date", "component", "type_term", "value"] as const;

const normalizeCity = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

export async function parseMemoriaCalculo(input: XlsxInput): Promise<MemoriaWorkbook> {
  const snap = await readXlsx(input, 0);
  const diagnostics: ParseDiagnostic[] = [];

  // Buscar columnas por header en la fila 1 — tolera reordenamientos.
  const colIdx: Record<string, number> = {};
  for (let c = 1; c <= snap.columnCount; c++) {
    const h = snap.cellAt(1, c);
    if (typeof h === "string") {
      const k = h.trim().toLowerCase();
      if ((EXPECTED_HEADERS as readonly string[]).includes(k) && colIdx[k] == null) {
        colIdx[k] = c;
      }
    }
  }
  for (const h of EXPECTED_HEADERS) {
    if (colIdx[h] == null) {
      throw new Error(`Memoria: columna '${h}' no encontrada en la fila de headers`);
    }
  }

  const rows: MemoriaRow[] = [];
  const dateCounts = new Map<string, { date: Date; count: number }>();

  for (let r = 2; r <= snap.rowCount; r++) {
    const cityRaw = snap.cellAt(r, colIdx.city!);
    const comp    = snap.cellAt(r, colIdx.component!);
    const tt      = snap.cellAt(r, colIdx.type_term!);
    const valRaw  = snap.cellAt(r, colIdx.value!);
    const dateRaw = snap.cellAt(r, colIdx.start_date!);

    if (cityRaw == null || comp == null || tt == null) continue;

    const cityNorm = normalizeCity(String(cityRaw));
    const cityInfo = findMercadoByName(cityNorm);

    let value: number | null = null;
    if (typeof valRaw === "number") value = valRaw;
    else if (typeof valRaw === "string") {
      const n = Number(valRaw.replace(",", "."));
      value = Number.isFinite(n) ? n : null;
    }

    let startDate: Date | undefined;
    if (dateRaw instanceof Date) {
      startDate = dateRaw;
      const key = startDate.toISOString().slice(0, 7);
      const entry = dateCounts.get(key);
      if (entry) entry.count++;
      else dateCounts.set(key, { date: startDate, count: 1 });
    }

    rows.push({
      city: cityNorm,
      cityCode: cityInfo?.cityCode,
      startDate,
      component: String(comp),
      typeTerm: String(tt),
      value,
    });
  }

  // Construir índice city→comp→tt→value (último gana — pero todos son iguales).
  const index = new Map<number, Map<string, Map<string, number>>>();
  for (const row of rows) {
    if (row.cityCode == null || row.value == null) continue;
    let byComp = index.get(row.cityCode);
    if (!byComp) { byComp = new Map(); index.set(row.cityCode, byComp); }
    let byTt = byComp.get(row.component);
    if (!byTt) { byTt = new Map(); byComp.set(row.component, byTt); }
    byTt.set(row.typeTerm, row.value);
  }

  // Período: el start_date más frecuente.
  let period: MemoriaWorkbook["period"];
  if (dateCounts.size) {
    const sorted = [...dateCounts.values()].sort((a, b) => b.count - a.count);
    const top = sorted[0]!.date;
    period = {
      year: top.getUTCFullYear(),
      month: top.getUTCMonth() + 1,
      label: top.toISOString().slice(0, 7),
    };
  }

  const cityCodes = [...index.keys()].sort((a, b) => a - b);

  // Diagnóstico — mercados desconocidos o sin datos esperados.
  const unknownCities = new Set<string>();
  for (const r of rows) {
    if (r.cityCode == null) unknownCities.add(r.city);
  }
  if (unknownCities.size) {
    diagnostics.push({
      level: "warn",
      code: "memoria.unknownCities",
      message: `Mercados no reconocidos: ${[...unknownCities].join(", ")}`,
    });
  }

  return { rows, index, cityCodes, period, diagnostics };
}

/**
 * Lookup con fallback: si (component, typeTerm) no existe para un mercado,
 * devuelve 0 y emite diagnóstico opcional.
 */
export function lookup(
  mem: MemoriaWorkbook,
  cityCode: number,
  component: string,
  typeTerm: string,
): number {
  return mem.index.get(cityCode)?.get(component)?.get(typeTerm) ?? 0;
}
