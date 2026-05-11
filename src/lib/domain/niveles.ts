/**
 * Traducción entre las distintas notaciones de Nivel de Tensión / Propiedad
 * que se usan en este dominio:
 *
 *  - Reporte visual (origen):  "1 OR.", "1 Comp.", "1 US.", "2", "3"
 *  - T7 / T8 (SUI):            "1-100", "1-50", "1-0", "2", "3"
 *  - T3 / T4 columnas tarifa:  N1_100, N1_50, N1_0, N2, N3
 *
 * Significado:
 *  - 1 OR  → Activo de propiedad del Operador de Red       → 100% OR
 *  - 1 Comp → Activo compartido (Comercializador)           →  50% OR
 *  - 1 US  → Activo propiedad del Usuario                  →   0% OR
 *  - 2, 3  → Niveles 2 y 3 (sin desagregar por propiedad)
 *
 * Mapeo verificado con el dataset 2026-04:
 *   ANTIOQUIA, 1 OR     → I=840.3738  =  T3.tarifaN1_100 = 840.37
 *   ANTIOQUIA, 1 Comp   → I=808.5465  =  T3.tarifaN1_50  = 808.55
 *   ANTIOQUIA, 1 US     → I=776.7191  =  T3.tarifaN1_0   = 776.72
 *   ANTIOQUIA, 2        → I=662.0819  =  T3.tarifaN2     = 662.08
 *   ANTIOQUIA, 3        → I=551.7220  =  T3.tarifaN3     = 551.72
 */

import type { LevelCode, LevelLabel } from "../types.js";

export const LEVEL_LABELS: LevelLabel[] = ["1 OR.", "1 Comp.", "1 US.", "2", "3"];
export const LEVEL_CODES: LevelCode[] = ["1-100", "1-50", "1-0", "2", "3"];

const LABEL_TO_CODE: Record<LevelLabel, LevelCode> = {
  "1 OR.":    "1-100",
  "1 Comp.":  "1-50",
  "1 US.":    "1-0",
  "2":        "2",
  "3":        "3",
};

const CODE_TO_LABEL: Record<LevelCode, LevelLabel> = {
  "1-100": "1 OR.",
  "1-50":  "1 Comp.",
  "1-0":   "1 US.",
  "2":     "2",
  "3":     "3",
};

/** Acepta cualquier representación tolerable y devuelve el LevelCode canónico. */
export function toLevelCode(raw: unknown): LevelCode | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  // numéricos: 2, 3
  if (s === "2" || s === "2.0") return "2";
  if (s === "3" || s === "3.0") return "3";
  // T7 nativos
  if (s === "1-100" || s === "1-50" || s === "1-0") return s as LevelCode;
  // Etiquetas visuales (case-insensitive, tolera variantes)
  const up = s.toUpperCase().replace(/\s+/g, " ").replace(/\.+$/, ".");
  if (up.startsWith("1 OR"))   return "1-100";
  if (up.startsWith("1 COMP")) return "1-50";
  if (up.startsWith("1 US"))   return "1-0";
  return undefined;
}

export function levelCodeToTarifaField(code: LevelCode):
  "tarifaN1_100" | "tarifaN1_50" | "tarifaN1_0" | "tarifaN2" | "tarifaN3" {
  switch (code) {
    case "1-100": return "tarifaN1_100";
    case "1-50":  return "tarifaN1_50";
    case "1-0":   return "tarifaN1_0";
    case "2":     return "tarifaN2";
    case "3":     return "tarifaN3";
  }
}

export { LABEL_TO_CODE, CODE_TO_LABEL };
