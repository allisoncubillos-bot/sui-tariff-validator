import pg from "pg";

const { Pool } = pg;

/**
 * Pool único de conexiones a PostgreSQL. La cadena se lee de DATABASE_URL.
 * pg parsea automáticamente number/jsonb; los jsonb vuelven como objetos JS.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "Falta DATABASE_URL. Copia server/.env.example a server/.env y configúrala.",
  );
}

export const pool = new Pool({ connectionString });

pool.on("error", (err) => {
  // Errores de clientes ociosos (ej. reinicio de la BD). No tumbar el proceso.
  console.error("[db] error en cliente ocioso del pool:", err.message);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}
