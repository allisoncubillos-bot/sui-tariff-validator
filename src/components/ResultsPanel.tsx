import type { Difference, ValidationReport, ParseDiagnostic } from "../lib/web/api";

interface Props {
  diagnostics: ParseDiagnostic[];
  validations: ValidationReport[];
  diffs: Difference[];
  downloads: { label: string; blob: Blob; filename: string }[];
}

export function ResultsPanel({ diagnostics, validations, diffs, downloads }: Props) {
  const totalErr = validations.reduce((a, v) => a + v.errors.length, 0);
  const totalWarn = validations.reduce((a, v) => a + v.warnings.length, 0);

  const errDiffs = diffs.filter((d) => d.severity === "error");
  const warnDiffs = diffs.filter((d) => d.severity === "warn");

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="panel">
      <h2>Resultado</h2>

      <div className="kv" style={{ marginBottom: 20 }}>
        <div>
          <span className="k">Errores</span>
          <span className={`v ${totalErr ? "red" : "green"}`}>{totalErr}</span>
        </div>
        <div>
          <span className="k">Advertencias</span>
          <span className={`v ${totalWarn ? "yellow" : "green"}`}>{totalWarn}</span>
        </div>
        <div>
          <span className="k">Diferencias críticas</span>
          <span className={`v ${errDiffs.length ? "red" : "green"}`}>{errDiffs.length}</span>
        </div>
        <div>
          <span className="k">Diferencias menores</span>
          <span className={`v ${warnDiffs.length ? "yellow" : "green"}`}>{warnDiffs.length}</span>
        </div>
      </div>

      {downloads.length > 0 && (
        <div className="actions">
          {downloads.map((d) => (
            <button
              key={d.filename}
              className="download"
              onClick={() => download(d.blob, d.filename)}
            >
              ⬇ {d.label}
            </button>
          ))}
        </div>
      )}

      <h3>Diagnósticos del parser</h3>
      {diagnostics.length === 0 ? (
        <div className="empty-state">Sin diagnósticos.</div>
      ) : (
        <div className="alerts">
          {diagnostics.slice(0, 50).map((d, i) => (
            <div key={i} className={`alert ${d.level === "error" ? "error" : d.level === "warn" ? "warn" : "info"}`}>
              <span className="badge">{d.level}</span>
              <span className="msg">
                <code>{d.code}</code> — {d.message}
                {d.mercado && <> <span className="ref">[{d.mercado}]</span></>}
                {d.cellRef && <> <span className="ref">@{d.cellRef}</span></>}
              </span>
            </div>
          ))}
          {diagnostics.length > 50 && (
            <div className="alert info"><span className="msg">… y {diagnostics.length - 50} más</span></div>
          )}
        </div>
      )}

      <h3>Validaciones</h3>
      {validations.map((v, i) => (
        <details key={i} open={!v.passed}>
          <summary>
            {v.passed ? "✅" : "❌"} {v.format} — {v.errors.length} errores, {v.warnings.length} advertencias
          </summary>
          <div className="alerts" style={{ marginTop: 10 }}>
            {[...v.errors.map((e) => ({ ...e, lvl: "error" as const })),
              ...v.warnings.map((e) => ({ ...e, lvl: "warn" as const })),
              ...v.info.map((e) => ({ ...e, lvl: "info" as const }))]
              .map((iss, j) => (
              <div key={j} className={`alert ${iss.lvl}`}>
                <span className="badge">{iss.lvl}</span>
                <span className="msg">
                  <code>{iss.code}</code> — {iss.message}
                  {iss.ref && <> <span className="ref">[{iss.ref}]</span></>}
                </span>
              </div>
            ))}
          </div>
        </details>
      ))}

      <h3>Diferencias contra archivos provisionales</h3>
      {diffs.length === 0 ? (
        <div className="empty-state">Sin diferencias detectadas.</div>
      ) : (
        <details open>
          <summary>{diffs.length} diferencias totales — {errDiffs.length} críticas, {warnDiffs.length} advertencias</summary>
          <table className="diffs" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Severidad</th><th>Formato</th><th>Fila</th><th>Campo</th><th>Provisional</th><th>Reconstruido</th><th>Δ</th></tr>
            </thead>
            <tbody>
              {diffs.slice(0, 200).map((d, i) => (
                <tr key={i} className={d.severity}>
                  <td><span className={`badge ${d.severity}`}>{d.severity}</span></td>
                  <td>{d.format}</td>
                  <td>{d.rowKey}</td>
                  <td>{d.field}</td>
                  <td className="num">{fmt(d.provisional)}</td>
                  <td className="num">{fmt(d.reconstructed)}</td>
                  <td className="num">{d.delta != null ? d.delta.toFixed(5) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {diffs.length > 200 && (
            <div className="empty-state">+ {diffs.length - 200} diferencias adicionales — descargá el JSON desde la consola del navegador.</div>
          )}
        </details>
      )}
    </div>
  );
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toFixed(5);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}
