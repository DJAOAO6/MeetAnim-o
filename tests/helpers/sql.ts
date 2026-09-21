import pg from "pg";

/**
 * Accès direct à la base pour préparer et vérifier les données des tests.
 *
 * Remplace le pilote HTTP de Neon (`@neondatabase/serverless`), qui ne sait
 * parler qu'à Neon : la base de test tourne désormais sur un PostgreSQL
 * local, sans quota ni dépendance à un hébergeur. Même interface que
 * `neon(url)` — un gabarit `` sql`SELECT … ${valeur}` `` qui renvoie les
 * lignes —, pour que les specs n'aient qu'une ligne d'import à changer.
 *
 * Les valeurs interpolées deviennent des paramètres ($1, $2…), jamais du
 * texte collé dans la requête : pas d'injection possible, comme avec Neon.
 */
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, any>[]>; // eslint-disable-line @typescript-eslint/no-explicit-any

const pools = new Map<string, pg.Pool>();

export function neon(connectionString: string): SqlTag {
  let pool = pools.get(connectionString);
  if (!pool) {
    // allowExitOnIdle : un pool resté ouvert ne doit pas empêcher un
    // processus de test de se terminer.
    pool = new pg.Pool({ connectionString, max: 4, allowExitOnIdle: true });
    pools.set(connectionString, pool);
  }
  const target = pool;
  return async (strings, ...values) => {
    const text = strings.reduce((query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""), "");
    const result = await target.query(text, values);
    return result.rows;
  };
}
