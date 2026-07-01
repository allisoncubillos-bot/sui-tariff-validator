import { useEffect, useState } from "react";
import { listRuns, getRun, pingBackend, fileDownloadUrl, type RunSummary, type RunMode, type RunFile } from "../lib/web/history";
import type { Difference, ValidationReport, ParseDiagnostic } from "../lib/web/api";

const MODE_LABEL: Record<RunMode, string> = {
  publicacion: "Publicación",
  republicacion: "Republicación",
  t9: "T9",
};

/**
 * Historial de corridas persistidas en la BD. Lista las últimas ejecuciones
 * y permite abrir el detalle (diagnósticos, validaciones y diferencias).
 */
export function HistoryPanel() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"" | RunMode>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const up = await pingBackend();
      setOnline(up);
      if (!up) {
        setRuns([]);
        setTotal(0);
        return;
      }
      const res = await listRuns({ mode: filter || undefined, limit: 100 });
      setRuns(res.runs);
      setTotal(res.total);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ marginRight: "auto" }}>Historial de corridas</h2>
        <span style={{ fontSize: 13 }}>
          Backend:{" "}
          {online == null ? "…" : online ? (
            <span style={{ color: "var(--ok, #2e7d32)" }}>● en línea</span>
          ) : (
            <span style={{ color: "var(--err)" }}>● offline</span>
          )}
        </span>
        <select value={filter} onChange={(e) => setFilter(e.target.value as "" | RunMode)}>
          <option value="">Todos los modos</option>
          <option value="publicacion">Publicación</option>
          <option value="republicacion">Republicación</option>
          <option value="t9">T9</option>
        </select>
        <button onClick={() => void refresh()} disabled={loading}>
          {loading ? "Cargando…" : "↻ Refrescar"}
        </button>
      </div>

      {error && <div className="alert error" style={{ marginTop: 12 }}><span className="msg">{error}</span></div>}

      {online === false && !error && (
        <div className="empty-state" style={{ marginTop: 12 }}>
          El backend no responde. Inicia el servidor (<code>cd server &amp;&amp; npm run dev</code>) y verifica que PostgreSQL esté corriendo.
        </div>
      )}

      {online && runs.length === 0 && !loading && (
        <div className="empty-state" style={{ marginTop: 12 }}>Aún no hay corridas guardadas.</div>
      )}

      {runs.length > 0 && (
        <>
          <p className="subtitle" style={{ marginTop: 12 }}>{total} corrida(s) en total.</p>
          <div style={{ overflowX: "auto" }}>
            <table className="diffs">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Modo</th>
                  <th>Período</th>
                  <th>Estado</th>
                  <th>Validaciones</th>
                  <th>Errores</th>
                  <th>Adv.</th>
                  <th>Diferencias</th>
                  <th>Mercados</th>
                  <th>Salidas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString("es-CO")}</td>
                    <td>{MODE_LABEL[r.mode]}</td>
                    <td>{r.period_year && r.period_month ? `${r.period_year}-${String(r.period_month).padStart(2, "0")}` : "—"}</td>
                    <td><span className={`badge ${r.ok ? "" : "error"}`}>{r.ok ? "✅ OK" : "❌ revisar"}</span></td>
                    <td className="num">{r.mode === "t9" ? "—" : `${r.validations_passed}/${r.validations_total}`}</td>
                    <td className="num">{r.errors_count}</td>
                    <td className="num">{r.warnings_count}</td>
                    <td className="num">{r.mode === "t9" ? "—" : r.diffs_count}</td>
                    <td className="num">{r.mercados?.length ?? 0}</td>
                    <td>{(r.files?.length ?? 0) > 0
                      ? r.files.map((f) => (
                          <a key={f.id} href={fileDownloadUrl(f.id)} className="filelink" style={{ marginRight: 8 }}>
                            ⬇ {f.label ?? f.filename}
                          </a>
                        ))
                      : (r.outputs ?? []).map((o) => o.filename).join(", ") || "—"}</td>
                    <td>
                      <button onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                        {openId === r.id ? "Cerrar" : "Ver"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {openId && <RunDetail id={openId} />}
        </>
      )}
    </div>
  );
}

function RunDetail({ id }: { id: string }) {
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    getRun(id).then(setData).catch((e) => setErr(e?.message ?? String(e)));
  }, [id]);

  if (err) return <div className="alert error" style={{ marginTop: 16 }}><span className="msg">{err}</span></div>;
  if (!data) return <div className="loading" style={{ marginTop: 16 }}>Cargando detalle…</div>;

  const diagnostics: ParseDiagnostic[] = data.diagnostics ?? [];
  const validations: ValidationReport[] = data.validations ?? [];
  const diffs: Difference[] = data.diffs ?? [];
  const inputs: { role: string; filename: string; size: number }[] = data.input_files ?? [];
  const files: RunFile[] = data.files ?? [];

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border, #333)", paddingTop: 16 }}>
      <h3>Detalle de la corrida</h3>

      <h4>Archivos generados ({files.length})</h4>
      {files.length === 0 ? <div className="empty-state">Sin archivos en el bucket para esta corrida.</div> : (
        <div className="actions">
          {files.map((f) => (
            <a key={f.id} href={fileDownloadUrl(f.id)} className="download">
              ⬇ {f.label ?? f.filename} ({Math.round(f.size_bytes / 1024)} KB)
            </a>
          ))}
        </div>
      )}

      <h4 style={{ marginTop: 16 }}>Archivos de entrada ({inputs.length})</h4>
      {inputs.length === 0 ? <div className="empty-state">—</div> : (
        <ul>
          {inputs.map((f, i) => (
            <li key={i}><code>{f.role}</code>: {f.filename} ({Math.round(f.size / 1024)} KB)</li>
          ))}
        </ul>
      )}

      <h4>Diagnósticos ({diagnostics.length})</h4>
      {diagnostics.length === 0 ? <div className="empty-state">Sin diagnósticos.</div> : (
        <div className="alerts">
          {diagnostics.slice(0, 50).map((d, i) => (
            <div key={i} className={`alert ${d.level === "error" ? "error" : d.level === "warn" ? "warn" : "info"}`}>
              <span className="badge">{d.level}</span>
              <span className="msg"><code>{d.code}</code> — {d.message}{d.mercado ? ` [${d.mercado}]` : ""}</span>
            </div>
          ))}
        </div>
      )}

      {validations.length > 0 && (
        <>
          <h4>Validaciones</h4>
          {validations.map((v, i) => (
            <details key={i} open={!v.passed}>
              <summary>{v.passed ? "✅" : "❌"} {v.format} — {v.errors.length} errores, {v.warnings.length} advertencias</summary>
              <div className="alerts" style={{ marginTop: 8 }}>
                {[...v.errors.map((e) => ({ ...e, lvl: "error" as const })),
                  ...v.warnings.map((e) => ({ ...e, lvl: "warn" as const }))].map((iss, j) => (
                  <div key={j} className={`alert ${iss.lvl}`}>
                    <span className="badge">{iss.lvl}</span>
                    <span className="msg"><code>{iss.code}</code> — {iss.message}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </>
      )}

      {diffs.length > 0 && (
        <>
          <h4>Diferencias ({diffs.length})</h4>
          <div style={{ overflowX: "auto" }}>
            <table className="diffs">
              <thead>
                <tr><th>Sev.</th><th>Formato</th><th>Fila</th><th>Campo</th><th>Provisional</th><th>Reconstruido</th><th>Δ</th></tr>
              </thead>
              <tbody>
                {diffs.slice(0, 100).map((d, i) => (
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
          </div>
          {diffs.length > 100 && <div className="empty-state">+ {diffs.length - 100} diferencias adicionales.</div>}
        </>
      )}
    </div>
  );
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return v.toFixed(5);
  return String(v);
}
