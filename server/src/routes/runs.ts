import { Router, type Request, type Response } from "express";
import { query } from "../db.js";

export const runsRouter = Router();

const MODES = new Set(["publicacion", "republicacion", "t9"]);

/** Columnas devueltas en el listado (sin los JSON pesados). */
const LIST_COLUMNS = `
  id, created_at, mode, period_year, period_month,
  fecha_publicacion, diario_publicacion,
  ok, validations_total, validations_passed, validations_failed,
  errors_count, warnings_count, diffs_count,
  mercados, outputs, app_version, created_by
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

/** GET /api/runs — lista corridas (resumen). Filtros: ?mode=&limit=&offset= */
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

/** GET /api/runs/:id — detalle completo (incluye JSON pesados). */
runsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const rows = (
      await query("SELECT * FROM validation_runs WHERE id = $1", [req.params.id])
    ).rows;
    if (rows.length === 0) return res.status(404).json({ error: "corrida no encontrada" });
    return res.json(rows[0]);
  } catch (err) {
    console.error("[runs] detail error:", err);
    return res.status(500).json({ error: "no se pudo leer la corrida" });
  }
});
