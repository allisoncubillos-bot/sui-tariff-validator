/**
 * API browser-friendly del sistema SUI tarifario.
 *
 * Diseñado para ser consumido desde un frontend (Lovable / Vite / cualquier
 * React app). NO usa fs, path ni nada Node-específico.
 *
 *   const result = await runPublicationBrowser({
 *     sourceFile,       // File (input type="file")
 *     t3File,           // File opcional
 *     t7File,           // File opcional
 *     fechaPublicacion: new Date("2026-04-16"),
 *     diarioPublicacion: "El Nuevo Siglo",
 *   });
 *   // result.t3Blob / result.t7Blob → URL.createObjectURL() → <a download>
 *   // result.diffsT3 / result.diffsT7 → renderizar en tabla
 *   // result.validations → renderizar como alertas
 */

import { parsePublicationSource } from "../parsers/source-publication.js";
import { parseRepublicationSource } from "../parsers/source-republication.js";
import { parseT3, parseT7, parseT4, parseT8 } from "../parsers/format-parsers.js";
import { generateT3 } from "../generators/t3.js";
import { generateT7 } from "../generators/t7.js";
import { generateT4, generateT8 } from "../generators/t4-t8.js";
import { writeXlsxToBuffer } from "../exporters/xlsx-writer.js";
import {
  T3_SPEC, T7_SPEC,
  T4_SPEC_18, T4_SPEC_20,
  T8_SPEC_10, T8_SPEC_12,
} from "../exporters/format-spec.js";
import { validateStructure } from "../validators/structure.js";
import { validateSourceMath, validateT3Consistency, validateT7Math } from "../validators/math.js";
import { compareT3, compareT7 } from "../validators/compare.js";
import { validateSemantic } from "../validators/semantic.js";
import type {
  SourceWorkbook, T3Row, T4Row, T7Row, T8Row,
  Difference, ValidationReport, ParseDiagnostic,
} from "../types.js";
import type { EstratoConfig } from "../generators/t3.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* ───────────────────────── PUBLICACIÓN ───────────────────────── */

export interface BrowserPublicationInputs {
  sourceFile: File | Blob;
  t3File?: File | Blob;
  t7File?: File | Blob;
  fechaPublicacion: Date;
  diarioPublicacion: string;
  tarifaOT?: number;
  cargoHorario?: number;
  estratos?: EstratoConfig[];
}

export interface BrowserPublicationResult {
  source: SourceWorkbook;
  t3Reconstructed: T3Row[];
  t7Reconstructed: T7Row[];
  diffsT3: Difference[];
  diffsT7: Difference[];
  validations: ValidationReport[];
  diagnostics: ParseDiagnostic[];
  /** Blob xlsx listo para descargar con `<a download>`. */
  t3Blob: Blob;
  t7Blob: Blob;
  t3Filename: string;
  t7Filename: string;
}

export async function runPublicationBrowser(
  inputs: BrowserPublicationInputs,
): Promise<BrowserPublicationResult> {
  const diagnostics: ParseDiagnostic[] = [];
  const validations: ValidationReport[] = [];

  const source = await parsePublicationSource(inputs.sourceFile);
  diagnostics.push(...source.diagnostics);
  validations.push(validateSourceMath(source.rows));

  let provT3: T3Row[] | undefined;
  let provT7: T7Row[] | undefined;
  if (inputs.t3File) {
    const r = await parseT3(inputs.t3File);
    diagnostics.push(...r.diagnostics);
    validations.push(validateStructure({ format: "T3", headers: r.headersRead, rowCount: r.rows.length }));
    provT3 = r.rows;
  }
  if (inputs.t7File) {
    const r = await parseT7(inputs.t7File);
    diagnostics.push(...r.diagnostics);
    validations.push(validateStructure({ format: "T7", headers: r.headersRead, rowCount: r.rows.length }));
    provT7 = r.rows;
  }

  const t3 = generateT3(source, {
    fechaPublicacion: inputs.fechaPublicacion,
    diarioPublicacion: inputs.diarioPublicacion,
    tarifaOT: inputs.tarifaOT,
    cargoHorario: inputs.cargoHorario,
    estratos: inputs.estratos,
    template: provT3,
  });
  const t7 = generateT7(source, { cargoHorario: inputs.cargoHorario });

  validations.push(validateT3Consistency(t3));
  validations.push(validateT7Math(t7));
  validations.push(validateSemantic({ source, t3, t7 }));

  const diffsT3 = provT3 ? compareT3(t3, provT3) : [];
  const diffsT7 = provT7 ? compareT7(t7, provT7) : [];

  const t3Buf = await writeXlsxToBuffer(T3_SPEC, t3);
  const t7Buf = await writeXlsxToBuffer(T7_SPEC, t7);
  const period = source.period;
  const stamp = `${period.year}-${String(period.month).padStart(2, "0")}`;

  return {
    source, t3Reconstructed: t3, t7Reconstructed: t7,
    diffsT3, diffsT7, validations, diagnostics,
    t3Blob: new Blob([t3Buf as BlobPart], { type: XLSX_MIME }),
    t7Blob: new Blob([t7Buf as BlobPart], { type: XLSX_MIME }),
    t3Filename: `T3_${stamp}_BIA.xlsx`,
    t7Filename: `T7_${stamp}_BIA.xlsx`,
  };
}

/* ───────────────────────── REPUBLICACIÓN ───────────────────────── */

export interface BrowserRepublicationInputs {
  republicationSourceFile: File | Blob;
  t3PublishedFile: File | Blob;
  t7PublishedFile: File | Blob;
  t4DraftFile?: File | Blob;
  t8DraftFile?: File | Blob;
  fechaPublicacion: Date;
  diarioPublicacion: string;
  tarifaOT?: number;
  cargoHorario?: number;
  estratos?: EstratoConfig[];
  useExtendedSpec?: boolean;
  anioCorregido?: number;
  mesCorregido?: number;
}

export interface BrowserRepublicationResult {
  t4: T4Row[];
  t8: T8Row[];
  mercadosRepublished: string[];
  diffsT4: Difference[];
  diffsT8: Difference[];
  validations: ValidationReport[];
  diagnostics: ParseDiagnostic[];
  t4Blob: Blob;
  t8Blob: Blob;
  t4Filename: string;
  t8Filename: string;
}

export async function runRepublicationBrowser(
  inputs: BrowserRepublicationInputs,
): Promise<BrowserRepublicationResult> {
  const diagnostics: ParseDiagnostic[] = [];
  const validations: ValidationReport[] = [];

  const repSrc = await parseRepublicationSource(inputs.republicationSourceFile);
  diagnostics.push(...repSrc.diagnostics);
  validations.push(validateSourceMath(repSrc.rows));

  const t3Base = await parseT3(inputs.t3PublishedFile);
  diagnostics.push(...t3Base.diagnostics);
  validations.push(validateStructure({ format: "T3", headers: t3Base.headersRead, rowCount: t3Base.rows.length }));

  const t7Base = await parseT7(inputs.t7PublishedFile);
  diagnostics.push(...t7Base.diagnostics);
  validations.push(validateStructure({ format: "T7", headers: t7Base.headersRead, rowCount: t7Base.rows.length }));

  validations.push(validateSemantic({ source: repSrc, t3: t3Base.rows, t7: t7Base.rows }));

  const t4 = generateT4(t3Base.rows, repSrc, {
    fechaPublicacion: inputs.fechaPublicacion,
    diarioPublicacion: inputs.diarioPublicacion,
    tarifaOT: inputs.tarifaOT,
    cargoHorario: inputs.cargoHorario,
    estratos: inputs.estratos,
    anioCorregido: inputs.anioCorregido,
    mesCorregido:  inputs.mesCorregido,
  });
  const t8 = generateT8(t7Base.rows, repSrc, {
    cargoHorario: inputs.cargoHorario,
    anioCorregido: inputs.anioCorregido,
    mesCorregido:  inputs.mesCorregido,
  });

  validations.push(validateT3Consistency(t4));
  validations.push(validateT7Math(t8));

  let diffsT4: Difference[] = [];
  let diffsT8: Difference[] = [];
  if (inputs.t4DraftFile) {
    const r = await parseT4(inputs.t4DraftFile);
    diagnostics.push(...r.diagnostics);
    validations.push(validateStructure({ format: "T4", headers: r.headersRead, rowCount: r.rows.length }));
    diffsT4 = compareT3(t4, r.rows).map((d) => ({ ...d, format: "T4" as const }));
  }
  if (inputs.t8DraftFile) {
    const r = await parseT8(inputs.t8DraftFile);
    diagnostics.push(...r.diagnostics);
    validations.push(validateStructure({ format: "T8", headers: r.headersRead, rowCount: r.rows.length }));
    diffsT8 = compareT7(t8, r.rows).map((d) => ({ ...d, format: "T8" as const }));
  }

  const t4Spec = inputs.useExtendedSpec ? T4_SPEC_20 : T4_SPEC_18;
  const t8Spec = inputs.useExtendedSpec ? T8_SPEC_12 : T8_SPEC_10;
  const t4Buf = await writeXlsxToBuffer(t4Spec, t4);
  const t8Buf = await writeXlsxToBuffer(t8Spec, t8);
  const period = repSrc.period;
  const stamp = `${period.year}-${String(period.month).padStart(2, "0")}`;

  return {
    t4, t8, mercadosRepublished: repSrc.mercados,
    diffsT4, diffsT8, validations, diagnostics,
    t4Blob: new Blob([t4Buf as BlobPart], { type: XLSX_MIME }),
    t8Blob: new Blob([t8Buf as BlobPart], { type: XLSX_MIME }),
    t4Filename: `T4_${stamp}_BIA.xlsx`,
    t8Filename: `T8_${stamp}_BIA.xlsx`,
  };
}

/** Re-export de tipos para que la UI los renderice. */
export type {
  SourceWorkbook, T3Row, T4Row, T7Row, T8Row,
  Difference, ValidationReport, ParseDiagnostic,
} from "../types.js";
