import { useState } from "react";
import { FileInput } from "./components/FileInput";
import { ResultsPanel } from "./components/ResultsPanel";
import { T9Panel } from "./components/T9Panel";
import { HistoryPanel } from "./components/HistoryPanel";
import {
  runPublicationBrowser,
  runRepublicationBrowser,
  type BrowserPublicationResult,
  type BrowserRepublicationResult,
} from "./lib/web/api";
import { saveRun, uploadRunFiles, buildPublicationAudit, buildRepublicationAudit, type OutputFile } from "./lib/web/history";

type Mode = "publicacion" | "republicacion" | "t9" | "historial";

export default function App() {
  const [mode, setMode] = useState<Mode>("publicacion");

  // Inputs comunes
  const [fechaPublicacion, setFechaPublicacion] = useState("2026-04-16");
  const [diarioPublicacion, setDiarioPublicacion] = useState("El Nuevo Siglo");

  // Publicación
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [t3File, setT3File] = useState<File | null>(null);
  const [t7File, setT7File] = useState<File | null>(null);

  // Republicación
  const [repSourceFile, setRepSourceFile] = useState<File | null>(null);
  const [t3BaseFile, setT3BaseFile] = useState<File | null>(null);
  const [t7BaseFile, setT7BaseFile] = useState<File | null>(null);
  const [t4DraftFile, setT4DraftFile] = useState<File | null>(null);
  const [t8DraftFile, setT8DraftFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pubResult, setPubResult] = useState<BrowserPublicationResult | null>(null);
  const [repResult, setRepResult] = useState<BrowserRepublicationResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const canPub = mode === "publicacion" && sourceFile != null && !busy;
  const canRep = mode === "republicacion" && repSourceFile != null && t3BaseFile != null && t7BaseFile != null && !busy;

  /** Persiste la corrida y sube los .xlsx al bucket (no bloquea el flujo si falla). */
  async function persistRun(payload: Parameters<typeof saveRun>[0], files: OutputFile[]) {
    setSaveStatus("Guardando en historial…");
    try {
      const { id } = await saveRun(payload);
      if (files.length) {
        setSaveStatus("Subiendo archivos al bucket…");
        await uploadRunFiles(id, files);
      }
      setSaveStatus(files.length ? "✔ Guardado en historial + archivos" : "✔ Guardado en historial");
    } catch (e: any) {
      setSaveStatus(`⚠ No se pudo guardar en historial: ${e?.message ?? e}`);
    }
  }

  async function ejecutar() {
    setError(null);
    setSaveStatus(null);
    setBusy(true);
    try {
      if (mode === "publicacion" && sourceFile) {
        const r = await runPublicationBrowser({
          sourceFile,
          t3File: t3File ?? undefined,
          t7File: t7File ?? undefined,
          fechaPublicacion: new Date(fechaPublicacion),
          diarioPublicacion,
        });
        setPubResult(r);
        // Save full JSON to window for debugging power-users
        (window as any).__pubResult = r;
        void persistRun(buildPublicationAudit(r, {
          sourceFile, t3File, t7File, fechaPublicacion, diarioPublicacion,
        }), [
          { label: "T3", filename: r.t3Filename, blob: r.t3Blob },
          { label: "T7", filename: r.t7Filename, blob: r.t7Blob },
        ]);
      } else if (mode === "republicacion" && repSourceFile && t3BaseFile && t7BaseFile) {
        const r = await runRepublicationBrowser({
          republicationSourceFile: repSourceFile,
          t3PublishedFile: t3BaseFile,
          t7PublishedFile: t7BaseFile,
          t4DraftFile: t4DraftFile ?? undefined,
          t8DraftFile: t8DraftFile ?? undefined,
          fechaPublicacion: new Date(fechaPublicacion),
          diarioPublicacion,
        });
        setRepResult(r);
        (window as any).__repResult = r;
        void persistRun(buildRepublicationAudit(r, {
          repSourceFile, t3BaseFile, t7BaseFile, t4DraftFile, t8DraftFile,
          fechaPublicacion, diarioPublicacion,
        }), [
          { label: "T4", filename: r.t4Filename, blob: r.t4Blob },
          { label: "T8", filename: r.t8Filename, blob: r.t8Blob },
        ]);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="appbar">
        <div className="brand-mark">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M7 21l5-6 4 3 7-9" stroke="#06121f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div className="brand-eyebrow"><b>BIA ENERGY</b> · Mercado Regulado</div>
          <h1>Validador <span className="grad">SUI tarifario</span></h1>
        </div>
      </div>
      <p className="subtitle">
        Sube los Excel y obtén T3/T7 (publicación) o T4/T8 (republicación) validados, con 5 decimales y
        comparados contra los provisionales. Cada corrida queda guardada en tu historial local con sus archivos.
      </p>

      <div className="tabs">
        <button className={`tab ${mode === "publicacion" ? "active" : ""}`} onClick={() => setMode("publicacion")}>Publicación</button>
        <button className={`tab ${mode === "republicacion" ? "active" : ""}`} onClick={() => setMode("republicacion")}>Republicación</button>
        <button className={`tab ${mode === "t9" ? "active" : ""}`} onClick={() => setMode("t9")}>T9</button>
        <button className={`tab ${mode === "historial" ? "active" : ""}`} onClick={() => setMode("historial")}>Historial</button>
      </div>

      {mode === "historial" ? <HistoryPanel /> : mode === "t9" ? <T9Panel /> : (<>
      <div className="panel">
        <h2>Datos de publicación</h2>
        <div className="grid">
          <div className="field">
            <label>Fecha de publicación</label>
            <input type="date" value={fechaPublicacion} onChange={(e) => setFechaPublicacion(e.target.value)} />
          </div>
          <div className="field">
            <label>Diario</label>
            <input type="text" value={diarioPublicacion} onChange={(e) => setDiarioPublicacion(e.target.value)} />
          </div>
        </div>
      </div>

      {mode === "publicacion" ? (
        <div className="panel">
          <h2>Archivos — Publicación</h2>
          <div className="grid">
            <FileInput
              label="Excel origen (publicación visual)"
              required
              file={sourceFile}
              onFile={setSourceFile}
              hint="p.ej. 6376. Publicación Abril.xlsx"
            />
            <FileInput
              label="T3 provisional (opcional, para comparar)"
              file={t3File}
              onFile={setT3File}
              hint="p.ej. T3. 2026-04.xlsx"
            />
            <FileInput
              label="T7 provisional (opcional, para comparar)"
              file={t7File}
              onFile={setT7File}
              hint="p.ej. T7- 2026-04.xlsx"
            />
          </div>
        </div>
      ) : (
        <div className="panel">
          <h2>Archivos — Republicación</h2>
          <div className="grid">
            <FileInput
              label="Excel origen republicación"
              required
              file={repSourceFile}
              onFile={setRepSourceFile}
              hint="p.ej. 6409. Republicación abril 2026.xlsx"
            />
            <FileInput
              label="T3 publicado (base)"
              required
              file={t3BaseFile}
              onFile={setT3BaseFile}
              hint="el T3 que ya se envió y aceptó"
            />
            <FileInput
              label="T7 publicado (base)"
              required
              file={t7BaseFile}
              onFile={setT7BaseFile}
              hint="el T7 que ya se envió y aceptó"
            />
            <FileInput
              label="T4 borrador (opcional, para comparar)"
              file={t4DraftFile}
              onFile={setT4DraftFile}
            />
            <FileInput
              label="T8 borrador (opcional, para comparar)"
              file={t8DraftFile}
              onFile={setT8DraftFile}
            />
          </div>
        </div>
      )}

      <div className="actions">
        <button
          className="primary"
          disabled={!(mode === "publicacion" ? canPub : canRep)}
          onClick={ejecutar}
        >
          {busy ? "Procesando…" : mode === "publicacion" ? "Generar T3 / T7" : "Generar T4 / T8"}
        </button>
        {error && <span style={{ color: "var(--err)", alignSelf: "center" }}>❌ {error}</span>}
        {saveStatus && <span style={{ alignSelf: "center", fontSize: 13 }}>{saveStatus}</span>}
      </div>

      {mode === "publicacion" && pubResult && (
        <ResultsPanel
          diagnostics={pubResult.diagnostics}
          validations={pubResult.validations}
          diffs={[...pubResult.diffsT3, ...pubResult.diffsT7]}
          downloads={[
            { label: "Descargar T3 final", blob: pubResult.t3Blob, filename: pubResult.t3Filename },
            { label: "Descargar T7 final", blob: pubResult.t7Blob, filename: pubResult.t7Filename },
          ]}
        />
      )}

      {mode === "republicacion" && repResult && (
        <ResultsPanel
          diagnostics={repResult.diagnostics}
          validations={repResult.validations}
          diffs={[...repResult.diffsT4, ...repResult.diffsT8]}
          downloads={[
            { label: "Descargar T4 final", blob: repResult.t4Blob, filename: repResult.t4Filename },
            { label: "Descargar T8 final", blob: repResult.t8Blob, filename: repResult.t8Filename },
          ]}
        />
      )}

      {mode === "republicacion" && repResult && (
        <div className="panel">
          <h3>Mercados republicados detectados</h3>
          <div className="kv">
            {repResult.mercadosRepublished.map((m) => (
              <div key={m}><span className="v" style={{ fontSize: 18 }}>{m}</span></div>
            ))}
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
