/**
 * Comparador filas reconstruidas (a partir del SOURCE) vs filas provisionales
 * (T3 / T7 que ya envió el área). Detecta diferencias por celda con la
 * tolerancia configurada.
 */

import type { T3Row, T7Row, Difference } from "../types.js";
import { NUMERIC_TOLERANCE } from "../domain/constants.js";

const T3_FIELDS_NUMERIC: (keyof T3Row)[] = [
  "pctSub100", "pctSub50", "pctSub0",
  "tarifaN1_100", "tarifaN1_50", "tarifaN1_0",
  "tarifaN2", "tarifaN3", "tarifaN4",
  "cfjm", "tarifaOT",
];
const T7_FIELDS_NUMERIC: (keyof T7Row)[] = [
  "gm", "tm", "rm", "dnm", "prnm", "cvm", "cuvm", "cargoHorario",
];

export function compareT3(
  reconstructed: T3Row[],
  provisional: T3Row[],
  tolerance = NUMERIC_TOLERANCE,
): Difference[] {
  const diffs: Difference[] = [];
  const idxProv = new Map<string, T3Row>();
  for (const p of provisional) idxProv.set(t3Key(p), p);
  const idxRec = new Map<string, T3Row>();
  for (const r of reconstructed) idxRec.set(t3Key(r), r);

  // Filas en provisional que no aparecen reconstruidas
  for (const k of idxProv.keys()) {
    if (!idxRec.has(k)) {
      diffs.push({
        format: "T3", rowKey: k, field: "__row__",
        provisional: "PRESENT", reconstructed: "MISSING",
        severity: "error",
      });
    }
  }
  // Filas en reconstruidas que no aparecen en provisional
  for (const k of idxRec.keys()) {
    if (!idxProv.has(k)) {
      diffs.push({
        format: "T3", rowKey: k, field: "__row__",
        provisional: "MISSING", reconstructed: "PRESENT",
        severity: "warn",
      });
    }
  }
  // Comparación campo a campo
  for (const [k, r] of idxRec) {
    const p = idxProv.get(k);
    if (!p) continue;
    for (const f of T3_FIELDS_NUMERIC) {
      const dv = numDiff(r[f] as number, p[f] as number);
      if (dv != null && dv > tolerance) {
        diffs.push({
          format: "T3", rowKey: k, field: String(f),
          provisional: p[f], reconstructed: r[f], delta: dv,
          severity: f.toString().startsWith("tarifa") ? "error" : "warn",
        });
      }
    }
    // String fields
    if (norm(r.diarioPublicacion) !== norm(p.diarioPublicacion)) {
      diffs.push({
        format: "T3", rowKey: k, field: "diarioPublicacion",
        provisional: p.diarioPublicacion, reconstructed: r.diarioPublicacion,
        severity: "info",
      });
    }
  }
  return diffs;
}

export function compareT7(
  reconstructed: T7Row[],
  provisional: T7Row[],
  tolerance = NUMERIC_TOLERANCE,
): Difference[] {
  const diffs: Difference[] = [];
  const idxProv = new Map<string, T7Row>(provisional.map((p) => [t7Key(p), p]));
  const idxRec  = new Map<string, T7Row>(reconstructed.map((r) => [t7Key(r), r]));

  for (const k of idxProv.keys()) {
    if (!idxRec.has(k)) diffs.push({ format: "T7", rowKey: k, field: "__row__", provisional: "PRESENT", reconstructed: "MISSING", severity: "error" });
  }
  for (const k of idxRec.keys()) {
    if (!idxProv.has(k)) diffs.push({ format: "T7", rowKey: k, field: "__row__", provisional: "MISSING", reconstructed: "PRESENT", severity: "warn" });
  }
  for (const [k, r] of idxRec) {
    const p = idxProv.get(k);
    if (!p) continue;
    for (const f of T7_FIELDS_NUMERIC) {
      const dv = numDiff(r[f] as number, p[f] as number);
      if (dv != null && dv > tolerance) {
        diffs.push({
          format: "T7", rowKey: k, field: String(f),
          provisional: p[f], reconstructed: r[f], delta: dv,
          severity: ["cuvm", "gm", "tm", "rm", "dnm", "prnm", "cvm"].includes(String(f)) ? "error" : "warn",
        });
      }
    }
  }
  return diffs;
}

function t3Key(r: T3Row): string {
  return `cityCode=${r.cityCode}|estrato=${r.estrato}`;
}
function t7Key(r: T7Row): string {
  return `cityCode=${r.cityCode}|level=${r.level}`;
}
function numDiff(a: number, b: number): number | undefined {
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.abs(a - b);
}
function norm(s: string | undefined): string {
  return (s ?? "").toString().trim().toLowerCase();
}
