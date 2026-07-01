import { Router, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { query } from "../db.js";

export const filesRouter = Router();

/** GET /api/files/:id — descarga un archivo del bucket. */
filesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const row = (
      await query<{ filename: string; mime: string | null; storage_path: string }>(
        "SELECT filename, mime, storage_path FROM run_files WHERE id = $1",
        [req.params.id],
      )
    ).rows[0];
    if (!row) return res.status(404).json({ error: "archivo no encontrado" });
    if (!existsSync(row.storage_path)) {
      return res.status(410).json({ error: "el archivo ya no existe en disco" });
    }
    if (row.mime) res.type(row.mime);
    return res.download(row.storage_path, row.filename);
  } catch (err) {
    console.error("[files] download error:", err);
    return res.status(500).json({ error: "no se pudo descargar el archivo" });
  }
});
