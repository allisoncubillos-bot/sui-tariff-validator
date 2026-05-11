/**
 * Generadores T4 y T8 (republicación).
 *
 * Regla de negocio fundamental:
 *   - Si un mercado FUE republicado → tomamos sus filas del SourceWorkbook
 *     de republicación.
 *   - Si un mercado NO FUE republicado → conservamos sus filas tal como
 *     estaban en el T3/T7 original (publicación).
 *
 * Esto se llama "merge por mercado" — la lista de mercados republicados
 * proviene de `republicationSource.mercados`.
 *
 * Se asume que el T4 y T8 que enviaremos al SUI tienen el mismo número de
 * columnas que T3 y T7 (18 y 10) — ESA es la spec real observada en los
 * archivos enviados por BIA. La spec en lineamientos menciona 20/12 con
 * Año/Mes Corregido, así que dejamos esos opcionales.
 */

import type {
  SourceWorkbook,
  T3Row, T4Row, T7Row, T8Row,
} from "../types.js";
import { findMercadoByName } from "../domain/mercados.js";
import { generateT3, type GenerateT3Options } from "./t3.js";
import { generateT7 } from "./t7.js";

export interface GenerateT4Options extends GenerateT3Options {
  /** Si la spec del SUI exige 20 columnas, pásalos aquí. Default: no. */
  anioCorregido?: number;
  mesCorregido?: number;
}

export interface GenerateT8Options {
  cargoHorario?: number;
  anioCorregido?: number;
  mesCorregido?: number;
}

/**
 * T4 = T3 original con filas de mercados republicados sustituidas por las
 * filas reconstruidas a partir del SourceWorkbook de republicación.
 */
export function generateT4(
  publicationT3: T3Row[],
  republicationSource: SourceWorkbook,
  opts: GenerateT4Options,
): T4Row[] {
  // 1) Conjunto de city_codes republicados
  const republishedCityCodes = new Set<number>();
  for (const m of republicationSource.mercados) {
    const info = findMercadoByName(m);
    if (info) republishedCityCodes.add(info.cityCode);
  }

  // 2) Genera filas T3 frescas SOLO para mercados republicados
  const republishedT3 = generateT3(republicationSource, opts);
  const republishedByKey = new Map<string, T3Row>();
  for (const r of republishedT3) republishedByKey.set(t3Key(r), r);

  // 3) Merge
  const merged: T4Row[] = [];
  for (const orig of publicationT3) {
    if (republishedCityCodes.has(orig.cityCode)) {
      const replaced = republishedByKey.get(t3Key(orig));
      if (replaced) {
        merged.push({
          ...replaced,
          anioCorregido: opts.anioCorregido,
          mesCorregido:  opts.mesCorregido,
        });
        continue;
      }
    }
    merged.push({
      ...orig,
      anioCorregido: opts.anioCorregido,
      mesCorregido:  opts.mesCorregido,
    });
  }
  return merged;
}

/**
 * T8 = T7 original con filas de mercados republicados reemplazadas por las
 * filas reconstruidas desde el source de republicación.
 */
export function generateT8(
  publicationT7: T7Row[],
  republicationSource: SourceWorkbook,
  opts: GenerateT8Options = {},
): T8Row[] {
  const republishedCityCodes = new Set<number>();
  for (const m of republicationSource.mercados) {
    const info = findMercadoByName(m);
    if (info) republishedCityCodes.add(info.cityCode);
  }

  const republishedT7 = generateT7(republicationSource, opts);
  const republishedByKey = new Map<string, T7Row>();
  for (const r of republishedT7) republishedByKey.set(t7Key(r), r);

  const merged: T8Row[] = [];
  for (const orig of publicationT7) {
    if (republishedCityCodes.has(orig.cityCode)) {
      const replaced = republishedByKey.get(t7Key(orig));
      if (replaced) {
        merged.push({ ...replaced, anioCorregido: opts.anioCorregido, mesCorregido: opts.mesCorregido });
        continue;
      }
    }
    merged.push({ ...orig, anioCorregido: opts.anioCorregido, mesCorregido: opts.mesCorregido });
  }
  return merged;
}

/* keys de identidad para hacer match al sustituir */

function t3Key(r: T3Row): string {
  return `${r.cityCode}|${r.cargoHorario}|${r.estrato}`;
}

function t7Key(r: T7Row): string {
  return `${r.cityCode}|${r.cargoHorario}|${r.level}`;
}
