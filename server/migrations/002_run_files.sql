-- Bucket local: archivos (.xlsx generados) asociados a cada corrida.
-- Los bytes viven en disco (server/storage/<run_id>/<archivo>); aquí solo
-- guardamos los metadatos y la ruta, para poder listarlos y servirlos.

CREATE TABLE IF NOT EXISTS run_files (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       uuid NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    label        text,                       -- "T3", "T7", "T9", ...
    filename     text NOT NULL,
    mime         text,
    size_bytes   bigint NOT NULL DEFAULT 0,
    storage_path text NOT NULL,              -- ruta absoluta/relativa en disco
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_files_run_id ON run_files (run_id);
