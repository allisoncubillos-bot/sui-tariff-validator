/**
 * Catálogo de mercados de BIA Energy y su city_code DANE (ID Mercado en SUI).
 *
 * El reporte visual usa el NOMBRE del mercado en mayúsculas; los formatos SUI
 * usan el city_code numérico. Esta tabla es la única fuente de verdad para
 * traducir entre ambos universos.
 *
 * El mapeo se infiere comparando el orden de aparición en "6376. Publicación
 * Abril.xlsx" contra los city_code presentes en T3/T7 enviados al SUI. Si tu
 * empresa atiende otros mercados, agrega aquí — el resto del sistema lo toma
 * automáticamente.
 */

export interface MercadoInfo {
  /** Etiqueta exacta en el reporte visual (sin tildes ortográficas se aceptan también). */
  name: string;
  /** city_code DANE oficial SUI. */
  cityCode: number;
  /** Aliases tolerados (mayúsculas/minúsculas, con/sin tilde) — se normalizan. */
  aliases?: string[];
}

/**
 * Mapeo verificado automáticamente con `tests/reconcile-mercados.ts` contra
 * el T3. 2026-04 de BIA Energy. Si BIA empieza a publicar un nuevo mercado,
 * agregalo aquí y re-corré `npm run reconcile` para validar.
 */
export const MERCADOS: MercadoInfo[] = [
  { name: "ANTIOQUIA",        cityCode: 704 },
  { name: "BOGOTÁ",           cityCode: 176, aliases: ["BOGOTA"] },
  { name: "BOYACÁ",           cityCode: 158, aliases: ["BOYACA"] },
  { name: "CALDAS",           cityCode: 162 },
  { name: "CALI",             cityCode: 165 },
  { name: "CARIBE MAR",       cityCode: 443 },
  { name: "CARIBE SOL",       cityCode: 444 },
  { name: "CARTAGO",          cityCode: 168 },
  { name: "CASANARE",         cityCode: 703 },
  { name: "CAUCA",            cityCode: 172 },
  { name: "HUILA",            cityCode: 170 },
  { name: "META",             cityCode: 175 },
  { name: "NARIÑO",           cityCode: 173, aliases: ["NARINO"] },
  { name: "NORTE SANTANDER",  cityCode: 161, aliases: ["N. SANTANDER", "N.SANTANDER"] },
  { name: "PEREIRA",          cityCode: 163 },
  { name: "QUINDÍO",          cityCode: 164, aliases: ["QUINDIO"] },
  { name: "SANTANDER",        cityCode: 160 },
  { name: "TOLIMA",           cityCode: 169 },
  { name: "TULUA",            cityCode: 166, aliases: ["TULUÁ"] },
  { name: "VALLE",            cityCode: 561 },
];

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

const byNorm = new Map<string, MercadoInfo>();
for (const m of MERCADOS) {
  byNorm.set(normalize(m.name), m);
  for (const a of m.aliases ?? []) byNorm.set(normalize(a), m);
}
const byCity = new Map<number, MercadoInfo>(MERCADOS.map((m) => [m.cityCode, m]));

export function findMercadoByName(name: string): MercadoInfo | undefined {
  return byNorm.get(normalize(name));
}

export function findMercadoByCityCode(code: number): MercadoInfo | undefined {
  return byCity.get(code);
}

/**
 * Verificación: los city_codes de arriba fueron conciliados automáticamente
 * comparando Tarifa N1 100% OR del T3 2026-04 vs CU+COT del nivel "1 OR." del
 * source. Si más adelante BIA Energy comienza a operar un nuevo mercado, se
 * agrega aquí y se corre `tests/reconcile-mercados.ts` para validar el match.
 */

/**
 * MERCADOS SUBSIDIADOS — decisión comercial de BIA Energy.
 *
 * Estos 3 mercados publican tarifa subsidiada para los estratos 1, 2 y 3 del
 * Nivel 1 residencial. Para el resto de mercados, BIA cobra tarifa plena en
 * Nivel 1 incluso a esos estratos.
 *
 * El generador T3 usa esta lista como SOURCE-OF-TRUTH para decidir si emite
 * filas de estratos 1-3, INDEPENDIENTEMENTE de si el Excel visual trae las
 * columnas Res.Estr.1/2/3 completas (a veces hay celdas vacías en el source
 * pero la fila SIEMPRE debe ir al SUI). Si el source carece de algún resEstr,
 * el generador cae a cuPlusCot y emite diagnóstico.
 *
 * Si BIA cambia su política de subsidios (deja de subsidiar uno, agrega otro,
 * etc.), EDITAR ESTA LISTA es lo único que hay que tocar.
 */
export const SUBSIDIZED_CITY_CODES = new Set<number>([
  170, // Huila
  160, // Santander
  561, // Valle
]);

/** Helper: ¿BIA aplica subsidio residencial (estratos 1-3) en este mercado? */
export function isSubsidizedMercado(cityCode: number): boolean {
  return SUBSIDIZED_CITY_CODES.has(cityCode);
}
