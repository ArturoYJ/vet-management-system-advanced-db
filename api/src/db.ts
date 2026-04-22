import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "./config";
import { AppRole, AuthContext } from "./types";

const roleMap: Record<AppRole, string> = {
  admin: "role_app_admin",
  reception: "role_app_reception",
  veterinarian: "role_app_veterinarian"
};

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30000
});

const setSessionContext = async (client: PoolClient, auth: AuthContext): Promise<void> => {
  const pgRole = roleMap[auth.role];
  await client.query(`SET LOCAL ROLE ${pgRole}`);

  if (auth.role === "veterinarian") {
    if (auth.vetId === null) {
      throw new Error("Veterinarian role requires a vetId context");
    }

    await client.query(
      "SELECT set_config('app.current_vet_id', $1, true)",
      [String(auth.vetId)]
    );
    return;
  }

  await client.query("SELECT set_config('app.current_vet_id', '', true)");
};

export const withAuthorizedClient = async <T>(
  auth: AuthContext,
  action: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setSessionContext(client, auth);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const query = async <T extends QueryResultRow>(
  auth: AuthContext,
  text: string,
  values: ReadonlyArray<unknown> = []
): Promise<QueryResult<T>> => withAuthorizedClient(auth, (client) => client.query<T>(text, [...values]));
