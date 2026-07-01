-- Historial / auditoría de corridas del Validador SUI tarifario.
-- Una fila por ejecución (publicación / republicación / T9).

CREATE TABLE IF NOT EXISTS validation_runs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          timestamptz NOT NULL DEFAULT now(),

    -- Modo de la corrida.
    mode                text NOT NULL CHECK (mode IN ('publicacion', 'republicacion', 't9')),

    -- Período del reporte (detectado del Excel origen / inputs).
    period_year         integer,
    period_month        integer,

    -- Parámetros comunes de publicación.
    fecha_publicacion   date,
    diario_publicacion  text,

    -- Métricas resumidas para listar rápido sin abrir los JSON.
    ok                  boolean NOT NULL DEFAULT false,
    validations_total   integer NOT NULL DEFAULT 0,
    validations_passed  integer NOT NULL DEFAULT 0,
    validations_failed  integer NOT NULL DEFAULT 0,
    errors_count        integer NOT NULL DEFAULT 0,
    warnings_count      integer NOT NULL DEFAULT 0,
    diffs_count         integer NOT NULL DEFAULT 0,

    -- Detalle completo (auditoría). Se guardan tal cual los produce la app.
    input_files         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{role, filename, size}]
    diagnostics         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ParseDiagnostic[]
    validations         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ValidationReport[]
    diffs               jsonb NOT NULL DEFAULT '[]'::jsonb,   -- Difference[]
    mercados            jsonb NOT NULL DEFAULT '[]'::jsonb,   -- string[] (republicados / detectados)
    outputs             jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{label, filename}] generados

    -- Contexto.
    app_version         text,
    created_by          text,
    user_agent          text
);

CREATE INDEX IF NOT EXISTS idx_validation_runs_created_at ON validation_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validation_runs_mode       ON validation_runs (mode);
CREATE INDEX IF NOT EXISTS idx_validation_runs_period     ON validation_runs (period_year, period_month);
