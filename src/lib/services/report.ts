/**
 * Reporte humano (texto) de un resultado de publicación/republicación.
 * Diseñado para imprimirse en CLI y para que el frontend lo muestre como
 * panel de alertas/diferencias.
 */

import type {
  Difference, ValidationReport, ParseDiagnostic,
} from "../types.js";

export interface ReportBundle {
  title: string;
  diagnostics: ParseDiagnostic[];
  validations: ValidationReport[];
  differences?: Difference[];
  outputs?: Record<string, string>;
}

export function formatReport(b: ReportBundle): string {
  const out: string[] = [];
  out.push(`╔══════════════════════════════════════════════════════════════╗`);
  out.push(`║ ${pad(b.title, 60)} ║`);
  out.push(`╚══════════════════════════════════════════════════════════════╝`);

  // Diagnostics del parser
  if (b.diagnostics.length) {
    out.push("");
    out.push("◆ Diagnósticos del parser:");
    for (const d of b.diagnostics) {
      out.push(`  [${d.level.toUpperCase()}] (${d.code}) ${d.message}${d.mercado ? ` — ${d.mercado}` : ""}${d.cellRef ? ` @${d.cellRef}` : ""}`);
    }
  }

  // Validaciones
  for (const v of b.validations) {
    out.push("");
    out.push(`◆ Validación ${v.format}: ${v.passed ? "✅ OK" : "❌ FALLA"}`);
    for (const e of v.errors)    out.push(`  ❌ ${e.code}: ${e.message}${e.ref ? ` (${e.ref})` : ""}`);
    for (const w of v.warnings)  out.push(`  ⚠️  ${w.code}: ${w.message}${w.ref ? ` (${w.ref})` : ""}`);
    for (const i of v.info)      out.push(`  ℹ️  ${i.code}: ${i.message}`);
  }

  // Diferencias
  if (b.differences && b.differences.length) {
    out.push("");
    out.push(`◆ Diferencias reconstruido vs provisional: ${b.differences.length}`);
    const byFormat: Record<string, Difference[]> = {};
    for (const d of b.differences) (byFormat[d.format] = byFormat[d.format] ?? []).push(d);
    for (const [fmt, list] of Object.entries(byFormat)) {
      out.push(`  ── ${fmt} (${list.length} diferencias)`);
      for (const d of list.slice(0, 25)) {
        const sev = d.severity === "error" ? "❌" : d.severity === "warn" ? "⚠️" : "ℹ️";
        const delta = d.delta != null ? ` Δ=${d.delta.toFixed(5)}` : "";
        out.push(`     ${sev} ${d.rowKey} · ${d.field}: prov=${fmt2(d.provisional)} rec=${fmt2(d.reconstructed)}${delta}`);
      }
      if (list.length > 25) out.push(`     ... (${list.length - 25} más)`);
    }
  } else if (b.differences) {
    out.push("");
    out.push("◆ Diferencias reconstruido vs provisional: ninguna ✅");
  }

  // Outputs
  if (b.outputs && Object.keys(b.outputs).length) {
    out.push("");
    out.push("◆ Archivos generados:");
    for (const [k, v] of Object.entries(b.outputs)) out.push(`  · ${k}: ${v}`);
  }

  return out.join("\n");
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}
function fmt2(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toFixed(5);
  return String(v);
}
