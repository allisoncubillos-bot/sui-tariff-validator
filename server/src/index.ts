import "dotenv/config";
import express from "express";
import cors from "cors";
import { runsRouter } from "./routes/runs.js";
import { filesRouter } from "./routes/files.js";
import { pool } from "./db.js";
import { ensureStorage } from "./storage.js";

const app = express();
const PORT = Number(process.env.PORT) || 8787;

ensureStorage();

const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5180")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: origins }));
// Las corridas incluyen diffs/validaciones; subimos el límite del body.
app.use(express.json({ limit: "25mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});

app.use("/api/runs", runsRouter);
app.use("/api/files", filesRouter);

app.listen(PORT, () => {
  console.log(`[sui-validator-api] escuchando en http://localhost:${PORT}`);
  console.log(`[sui-validator-api] CORS permitido para: ${origins.join(", ")}`);
});
