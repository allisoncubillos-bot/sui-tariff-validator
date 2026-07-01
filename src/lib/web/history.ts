/**
 * Cliente del backend de historial/auditoría.
 *
 * El backend (carpeta `server/`) persiste cada corrida en PostgreSQL. Este
 * módulo construye el payload de auditoría a partir de los resultados que ya
 * produce `api.ts` y lo envía vía REST.
 *
 * Base URL: `import.meta.env.VITE_API_URL` (ej. "http://localhost:8787") o,
 * por defecto, "/api" — que el dev server de Vite proxea al backend.
 */
import type {
  BrowserPublicationResult,
  BrowserRepublicationResult,
  BrowserT9Result,
} from "./api.js";
import type { Difference, ValidationReport, ParseDiagnostic } from "../types.js";

const APP_VERSION = "0.1.0";

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").toString().replace(/\/$/, "");
/** Si hay VITE_API_URL la usamos; si no, "/api" (proxy de Vite). */
const API_BASE = RAW_BASE ? `${RAW_BASE}/api` : "/api";

export type RunMode = "publicacion" | "republicacion" | "t9";

export interface RunAuditPayload {
  mode: RunMode;
  periodYear: number | null;
  periodMonth: number | null;
  fechaPublicacion?: string | null;
  diarioPublicacion?: string | null;
  ok: boolean;
  validationsTotal: number;
  validationsPassed: number;
  validationsFailed: number;
  errorsCount: number;
  warningsCount: number;
  diffsCount: number;
  inputFiles: { role: string; filename: string; size: number }[];
  diagnostics: ParseDiagnostic[];
  validations: ValidationReport[];
  diffs: Difference[];
  mercados: string[];
  outputs: { label: string; filename: string }[];
  appVersion: string;
  createdBy?: string | null;
}

/** Resumen que devuelve el listado (sin los JSON pesados). */
export interface RunSummary {
  id: string;
  created_at: string;
  mode: RunMode;
  period_year: number | null;
  period_month: number | null;
  fecha_publicacion: string | null;
  diario_publicacion: string | null;
  ok: boolean;
  validations_total: number;
  validations_passed: number;
  validations_failed: number;
  errors_count: number;
  warnings_count: number;
  diffs_count: number;
  mercados: string[];
  outputs: { label: string; filename: string }[];
  app_version: string | null;
  created_by: string | null;
}

/* ───────────────────────── REST ───────────────────────── */

export async function saveRun(payload: RunAuditPayload): Promise<{ id: string; created_at: string }> {
  const res = await fetch(`${API_BASE}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`saveRun ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listRuns(params: { mode?: RunMode; limit?: number; offset?: number } = {}): Promise<{
  total: number;
  runs: RunSummary[];
}> {
  const q = new URLSearchParams();
  if (params.mode) q.set("mode", params.mode);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const res = await fetch(`${API_BASE}/runs?${q.toString()}`);
  if (!res.ok) throw new Error(`listRuns ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getRun(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/runs/${id}`);
  if (!res.ok) throw new Error(`getRun ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Comprueba que el backend esté arriba (para mostrar estado en la UI). */
export async function pingBackend(): Promise<boolean> {
  try {
    const base = RAW_BASE || "";
    const res = await fetch(`${base}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/* ───────────────────── Builders de payload ───────────────────── */

function summarize(validations: ValidationReport[], diffs: Difference[]) {
  const validationsTotal = validations.length;
  const validationsPassed = validations.filter((v) => v.passed).length;
  const errorsCount = validations.reduce((a, v) => a + v.errors.length, 0);
  const warningsCount = validations.reduce((a, v) => a + v.warnings.length, 0);
  const errorDiffs = diffs.filter((d) => d.severity === "error").length;
  return {
    validationsTotal,
    validationsPassed,
    validationsFailed: validationsTotal - validationsPassed,
    errorsCount,
    warningsCount,
    diffsCount: diffs.length,
    ok: validationsTotal - validationsPassed === 0 && errorsCount === 0 && errorDiffs === 0,
  };
}

function fileMeta(role: string, f: File | null | undefined) {
  return f ? [{ role, filename: f.name, size: f.size }] : [];
}

/** Extrae {year, month} de nombres tipo "T3_2026-04_BIA.xlsx". */
function parseStamp(filename: string): { year: number | null; month: number | null } {
  const m = filename.match(/(\d{4})-(\d{2})/);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : { year: null, month: null };
}

export function buildPublicationAudit(
  r: BrowserPublicationResult,
  meta: {
    sourceFile: File | null;
    t3File?: File | null;
    t7File?: File | null;
    fechaPublicacion: string;
    diarioPublicacion: string;
  },
): RunAuditPayload {
  const diffs = [...r.diffsT3, ...r.diffsT7];
  const period = r.source.period;
  const stamp = period ? { year: period.year, month: period.month } : parseStamp(r.t3Filename);
  return {
    mode: "publicacion",
    periodYear: stamp.year,
    periodMonth: stamp.month,
    fechaPublicacion: meta.fechaPublicacion || null,
    diarioPublicacion: meta.diarioPublicacion || null,
    ...summarize(r.validations, diffs),
    inputFiles: [
      ...fileMeta("source", meta.sourceFile),
      ...fileMeta("t3_provisional", meta.t3File),
      ...fileMeta("t7_provisional", meta.t7File),
    ],
    diagnostics: r.diagnostics,
    validations: r.validations,
    diffs,
    mercados: r.source.mercados ?? [],
    outputs: [
      { label: "T3", filename: r.t3Filename },
      { label: "T7", filename: r.t7Filename },
    ],
    appVersion: APP_VERSION,
  };
}

export function buildRepublicationAudit(
  r: BrowserRepublicationResult,
  meta: {
    repSourceFile: File | null;
    t3BaseFile?: File | null;
    t7BaseFile?: File | null;
    t4DraftFile?: File | null;
    t8DraftFile?: File | null;
    fechaPublicacion: string;
    diarioPublicacion: string;
  },
): RunAuditPayload {
  const diffs = [...r.diffsT4, ...r.diffsT8];
  const stamp = parseStamp(r.t4Filename);
  return {
    mode: "republicacion",
    periodYear: stamp.year,
    periodMonth: stamp.month,
    fechaPublicacion: meta.fechaPublicacion || null,
    diarioPublicacion: meta.diarioPublicacion || null,
    ...summarize(r.validations, diffs),
    inputFiles: [
      ...fileMeta("source_republicacion", meta.repSourceFile),
      ...fileMeta("t3_publicado", meta.t3BaseFile),
      ...fileMeta("t7_publicado", meta.t7BaseFile),
      ...fileMeta("t4_borrador", meta.t4DraftFile),
      ...fileMeta("t8_borrador", meta.t8DraftFile),
    ],
    diagnostics: r.diagnostics,
    validations: r.validations,
    diffs,
    mercados: r.mercadosRepublished ?? [],
    outputs: [
      { label: "T4", filename: r.t4Filename },
      { label: "T8", filename: r.t8Filename },
    ],
    appVersion: APP_VERSION,
  };
}

export function buildT9Audit(
  r: BrowserT9Result,
  meta: {
    year: number;
    month: number;
    memoriaFile: File | null;
    precioFile?: File | null;
    cantFile?: File | null;
  },
): RunAuditPayload {
  const hasError = r.diagnostics.some((d) => d.level === "error");
  return {
    mode: "t9",
    periodYear: meta.year,
    periodMonth: meta.month,
    ok: !hasError,
    validationsTotal: 0,
    validationsPassed: 0,
    validationsFailed: 0,
    errorsCount: r.diagnostics.filter((d) => d.level === "error").length,
    warningsCount: r.diagnostics.filter((d) => d.level === "warn").length,
    diffsCount: 0,
    inputFiles: [
      ...fileMeta("memoria_calculo", meta.memoriaFile),
      ...fileMeta("precio_bolsa", meta.precioFile),
      ...fileMeta("cantidad_bolsa", meta.cantFile),
    ],
    diagnostics: r.diagnostics,
    validations: [],
    diffs: [],
    mercados: r.rows.map((row) => String(row.idMercado)),
    outputs: [{ label: "T9", filename: r.t9Filename }],
    appVersion: APP_VERSION,
  };
}
