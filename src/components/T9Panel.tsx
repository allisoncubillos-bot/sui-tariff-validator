import { useEffect, useMemo, useState } from "react";
import { FileInput } from "./FileInput";
import { runT9Browser, type BrowserT9Result } from "../lib/web/api";
import { T9_LS_PREFIX, T9_YEARLY_CONTRIBUTIONS } from "../lib/domain/t9-constants";

/**
 * Panel T9 — genera el archivo SUI "Variables CU 119 – UR" combinando:
 *   - Memoria de cálculo (xlsx long-format)
 *   - Matriz precio bolsa horaria (xlsx, día × 24 horas)
 *   - Matriz cantidad compras bolsa NO REGULADO horaria (xlsx, día × 24h)
 *
 * Particularidad: CREG ($) y SSPD ($) son anuales. Si el usuario selecciona
 * enero (mes inicial del año) o el año no tiene valor en localStorage, la UI
 * exige que se ingresen/actualicen los montos antes de generar.
 */
export function T9Panel() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [memoriaFile, setMemoriaFile] = useState<File | null>(null);
  const [precioFile,  setPrecioFile]  = useState<File | null>(null);
  const [cantFile,    setCantFile]    = useState<File | null>(null);

  const [cregPesos, setCregPesos] = useState<string>("");
  const [sspdPesos, setSspdPesos] = useState<string>("");
  const [contribStored, setContribStored] = useState(false);

  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [result, setResult] = useState<BrowserT9Result | null>(null);

  // Carga CREG/SSPD desde localStorage cuando cambia el año.
  useEffect(() => {
    const raw = localStorage.getItem(T9_LS_PREFIX + year);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { cregPesos: number; sspdPesos: number };
        setCregPesos(String(parsed.cregPesos));
        setSspdPesos(String(parsed.sspdPesos));
        setContribStored(true);
        return;
      } catch { /* ignore */ }
    }
    // Sin valor previo — usar defaults del catálogo si los hay, si no, vaciar.
    const fallback = T9_YEARLY_CONTRIBUTIONS[year];
    if (fallback) {
      setCregPesos(String(fallback.cregPesos));
      setSspdPesos(String(fallback.sspdPesos));
    } else {
      setCregPesos("");
      setSspdPesos("");
    }
    setContribStored(false);
  }, [year]);

  const cregNum = Number(cregPesos);
  const sspdNum = Number(sspdPesos);
  const contribValid = Number.isFinite(cregNum) && Number.isFinite(sspdNum) && cregPesos !== "" && sspdPesos !== "";

  // Si el mes seleccionado es enero o no hay valor guardado para el año,
  // tratamos los campos como "requieren confirmación".
  const requireContribUpdate = month === 1 || !contribStored;

  const canRun = memoriaFile && precioFile && cantFile && contribValid && !busy;

  function persistContrib() {
    if (!contribValid) return;
    localStorage.setItem(T9_LS_PREFIX + year, JSON.stringify({ cregPesos: cregNum, sspdPesos: sspdNum }));
    setContribStored(true);
  }

  async function ejecutar() {
    if (!memoriaFile || !precioFile || !cantFile) return;
    if (!contribValid) {
      setError("Ingresa CREG ($) y SSPD ($) válidos antes de generar.");
      return;
    }
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      persistContrib();
      const r = await runT9Browser({
        memoriaFile,
        precioBolsaFile: precioFile,
        cantidadBolsaFile: cantFile,
        year,
        month,
        cregPesos: cregNum,
        sspdPesos: sspdNum,
      });
      setResult(r);
      (window as any).__t9Result = r;
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function descargar() {
    if (!result) return;
    const url = URL.createObjectURL(result.t9Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.t9Filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const trimInfo = useMemo(() => ({
    trim: Math.ceil(month / 3),
    mgTrim: ((month - 1) % 3) + 1,
  }), [month]);

  return (
    <>
      <div className="panel">
        <h2>Período de reporte T9</h2>
        <div className="grid">
          <div className="field">
            <label>Año</label>
            <input type="number" min={2020} max={2100} value={year}
                   onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Mes</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>TRIM / MG TRIM (derivado)</label>
            <input type="text" readOnly value={`Q${trimInfo.trim} · mes ${trimInfo.mgTrim} del trimestre`} />
          </div>
        </div>
        <p className="subtitle" style={{ marginTop: 8 }}>
          La memoria de cálculo debe ser del mes m = {year}-{String(month).padStart(2, "0")}.
          Las matrices de bolsa deben ser del mes m-1.
        </p>
      </div>

      <div className="panel">
        <h2>Contribuciones anuales (CREG / SSPD)</h2>
        {requireContribUpdate && (
          <p className="subtitle" style={{ color: "var(--warn, #b58900)" }}>
            ⚠ {month === 1 ? "Estás en enero — " : ""}
            {!contribStored
              ? `No hay valores guardados para ${year}. Ingresa los montos del año y se persistirán para los meses siguientes.`
              : `Confirma que los valores de ${year} siguen vigentes.`}
          </p>
        )}
        <div className="grid">
          <div className="field">
            <label>CREG ($)</label>
            <input type="number" step="0.01" value={cregPesos}
                   placeholder="Contribución pagada a la CREG (anual)"
                   onChange={(e) => { setCregPesos(e.target.value); setContribStored(false); }} />
          </div>
          <div className="field">
            <label>SSPD ($)</label>
            <input type="number" step="0.01" value={sspdPesos}
                   placeholder="Contribución pagada a la SSPD (anual)"
                   onChange={(e) => { setSspdPesos(e.target.value); setContribStored(false); }} />
          </div>
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button type="button" disabled={!contribValid} onClick={persistContrib}>
            {contribStored ? "Guardado ✓" : "Guardar para " + year}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Archivos de insumo</h2>
        <div className="grid">
          <FileInput label="Memoria de cálculo" required file={memoriaFile} onFile={setMemoriaFile}
                     hint="xlsx exportado del query SQL — long format (city, component, type_term, value)" />
          <FileInput label="Matriz precio bolsa" required file={precioFile} onFile={setPrecioFile}
                     hint="día × 24 horas — versión TxF del mes m-1" />
          <FileInput label="Matriz cantidad compras bolsa NO REGULADO" required file={cantFile} onFile={setCantFile}
                     hint="día × 24 horas — concept=COMPRAS EN BOLSA, market=NO REGULADO" />
        </div>
      </div>

      <div className="actions">
        <button className="primary" disabled={!canRun} onClick={ejecutar}>
          {busy ? "Generando…" : "Generar T9"}
        </button>
        {error && <span style={{ color: "var(--err)", alignSelf: "center" }}>❌ {error}</span>}
      </div>

      {result && (
        <>
          <div className="panel">
            <h3>Resumen</h3>
            <div className="kv">
              <div><span className="k">Filas generadas:</span> <span className="v">{result.rows.length}</span></div>
              <div><span className="k">CB MNR (Σ cantidades):</span> <span className="v">{result.bolsa.cbMnr.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></div>
              <div><span className="k">VCB MNR (Σ precio·cantidad):</span> <span className="v">{result.bolsa.vcbMnr.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></div>
              <div><span className="k">Días bolsa:</span> <span className="v">{result.bolsa.daysCount}</span></div>
              {result.periodFromMemoria && (
                <div><span className="k">Período memoria:</span> <span className="v">{result.periodFromMemoria.label}</span></div>
              )}
            </div>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="primary" onClick={descargar}>⬇ Descargar {result.t9Filename}</button>
            </div>
          </div>

          {result.diagnostics.length > 0 && (
            <div className="panel">
              <h3>Diagnósticos ({result.diagnostics.length})</h3>
              <ul>
                {result.diagnostics.map((d, i) => (
                  <li key={i} style={{ color: d.level === "error" ? "var(--err)" : d.level === "warn" ? "var(--warn, #b58900)" : "inherit" }}>
                    <strong>[{d.level}] {d.code}</strong> — {d.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel">
            <h3>Preview (primeras filas)</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="diffs">
                <thead>
                  <tr>
                    <th>ID Mercado</th>
                    <th>ECC</th>
                    <th>VECC</th>
                    <th>CB MR</th>
                    <th>VCB MR</th>
                    <th>CB MNR</th>
                    <th>VCB MNR</th>
                    <th>AGPE / GTr</th>
                    <th>Alfa</th>
                    <th>CfJ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.idMercado}>
                      <td>{r.idMercado}</td>
                      <td className="num">{fmt(r.ecc)}</td>
                      <td className="num">{fmt(r.vecc)}</td>
                      <td className="num">{fmt(r.cbMr)}</td>
                      <td className="num">{fmt(r.vcbMr)}</td>
                      <td className="num">{fmt(r.cbMnr)}</td>
                      <td className="num">{fmt(r.vcbMnr)}</td>
                      <td className="num">{fmt(r.agpe)}</td>
                      <td className="num">{fmt(r.alfa)}</td>
                      <td className="num">{fmt(r.cfj)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function fmt(v: number): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 5 });
}
