import { Router, type Request, type Response } from "express";
import { writeFileSync } from "node:fs";
import multer from "multer";
import { query } from "../db.js";
import { pathForRunFile } from "../storage.js";

export const runsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
});

const MODES = new Set(["publicacion", "republicacion", "t9"]);

/** Subconsulta que agrega los archivos (bucket) de cada corrida como JSON. */
const FILES_SUBQUERY = `
  (SELECT coalesce(
     json_agg(json_build_object(
       'id', f.id, 'label', f.label, 'filename', f.filename, 'size_bytes', f.size_bytes
     ) ORDER BY f.created_at),
     '[]'::json)
   FROM run_files f WHERE f.run_id = validation_runs.id) AS files
`;

/** Columnas devueltas en el listado (sin los JSON pesados, pero con los archivos). */
const LIST_COLUMNS = `
  id, created_at, mode, period_year, period_month,
  fecha_publicacion, diario_publicacion,
  ok, validations_total, validations_passed, validations_failed,
  errors_count, warnings_count, diffs_count,
  mercados, outputs, app_version, created_by,
  ${FILES_SUBQUERY}
`;

function asJson(v: unknown, fallback: unknown[] = []): string {
  return JSON.stringify(v ?? fallback);
}
function asInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** POST /api/runs — guarda una corrida (auditoría). */
runsRouter.post("/", async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!MODES.has(b.mode)) {
    return res.status(400).json({ error: "mode inválido (publicacion | republicacion | t9)" });
  }

  try {
    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO validation_runs (
         mode, period_year, period_month, fecha_publicacion, diario_publicacion,
         ok, validations_total, validations_passed, validations_failed,
         errors_count, warnings_count, diffs_count,
         input_files, diagnostics, validations, diffs, mercados, outputs,
         app_version, created_by, user_agent
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12,
         $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb,
         $19, $20, $21
       )
       RETURNING id, created_at`,
      [
        b.mode,
        asInt(b.periodYear),
        asInt(b.periodMonth),
        b.fechaPublicacion || null,
        b.diarioPublicacion || null,
        Boolean(b.ok),
        asInt(b.validationsTotal) ?? 0,
        asInt(b.validationsPassed) ?? 0,
        asInt(b.validationsFailed) ?? 0,
        asInt(b.errorsCount) ?? 0,
        asInt(b.warningsCount) ?? 0,
        asInt(b.diffsCount) ?? 0,
        asJson(b.inputFiles),
        asJson(b.diagnostics),
        asJson(b.validations),
        asJson(b.diffs),
        asJson(b.mercados),
        asJson(b.outputs),
        b.appVersion || null,
        b.createdBy || null,
        req.get("user-agent") || null,
      ],
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[runs] insert error:", err);
    return res.status(500).json({ error: "no se pudo guardar la corrida" });
  }
});

/**
 * POST /api/runs/:id/files — sube al bucket los .xlsx generados de una corrida.
 * multipart/form-data: campo "files" (uno o varios) + campo "labels" (JSON
 * opcional: { "<filename>": "<label>" }).
 */
runsRouter.post("/:id/files", upload.array("files"), async (req: Request, res: Response) => {
  const runId = req.params.id;
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) return res.status(400).json({ error: "no se enviaron archivos" });

  let labels: Record<string, string> = {};
  try {
    if (req.body?.labels) labels = JSON.parse(req.body.labels);
  } catch { /* labels opcional */ }

  try {
    const exists = (await query("SELECT 1 FROM validation_runs WHERE id = $1", [runId])).rowCount;
    if (!exists) return res.status(404).json({ error: "corrida no encontrada" });

    const saved: unknown[] = [];
    for (const f of files) {
      const dest = pathForRunFile(runId, f.originalname);
      writeFileSync(dest, f.buffer);
      const row = (
        await query<{ id: string }>(
          `INSERT INTO run_files (run_id, label, filename, mime, size_bytes, storage_path)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [runId, labels[f.originalname] ?? null, f.originalname, f.mimetype, f.size, dest],
        )
      ).rows[0];
      saved.push({ id: row.id, label: labels[f.originalname] ?? null, filename: f.originalname, size_bytes: f.size });
    }
    return res.status(201).json({ files: saved });
  } catch (err) {
    console.error("[runs] upload error:", err);
    return res.status(500).json({ error: "no se pudieron guardar los archivos" });
  }
});

/** GET /api/runs — lista corridas (resumen + archivos). Filtros: ?mode=&limit=&offset= */
runsRouter.get("/", async (req: Request, res: Response) => {
  const limit = Math.min(asInt(req.query.limit) ?? 50, 200);
  const offset = asInt(req.query.offset) ?? 0;
  const mode = typeof req.query.mode === "string" && MODES.has(req.query.mode) ? req.query.mode : null;

  try {
    const where = mode ? "WHERE mode = $3" : "";
    const params: unknown[] = mode ? [limit, offset, mode] : [limit, offset];
    const rows = (
      await query(
        `SELECT ${LIST_COLUMNS} FROM validation_runs ${where}
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        params,
      )
    ).rows;
    const total = (
      await query<{ count: string }>(
        `SELECT count(*)::text AS count FROM validation_runs ${mode ? "WHERE mode = $1" : ""}`,
        mode ? [mode] : [],
      )
    ).rows[0]?.count;
    return res.json({ total: Number(total ?? 0), runs: rows });
  } catch (err) {
    console.error("[runs] list error:", err);
    return res.status(500).json({ error: "no se pudo listar el historial" });
  }
});

/** GET /api/runs/:id — detalle completo (incluye JSON pesados y archivos). */
runsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const rows = (
      await query(
        `SELECT *, ${FILES_SUBQUERY} FROM validation_runs WHERE id = $1`,
        [req.params.id],
      )
    ).rows;
    if (rows.length === 0) return res.status(404).json({ error: "corrida no encontrada" });
    return res.json(rows[0]);
  } catch (err) {
    console.error("[runs] detail error:", err);
    return res.status(500).json({ error: "no se pudo leer la corrida" });
  }
});
