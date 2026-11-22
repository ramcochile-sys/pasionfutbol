// Adaptador "estilo Cloudflare D1" sobre un cliente libSQL/Turso.
// Cubre lo que usa el worker: prepare().bind().first()/all()/run() y batch().

function rowsToObjects(resultSet) {
  const columns = resultSet.columns || [];
  return (resultSet.rows || []).map(row =>
    Object.fromEntries(columns.map((name, index) => [name, row[index]]))
  );
}

function toD1Result(resultSet) {
  return {
    success: true,
    results: rowsToObjects(resultSet),
    meta: {
      changes: resultSet.rowsAffected ?? 0,
      last_row_id: resultSet.lastInsertRowid == null ? null : Number(resultSet.lastInsertRowid)
    }
  };
}

function statement(client, sql, args = []) {
  const run = async () => toD1Result(await client.execute({ sql, args }));
  return {
    sql,
    args,
    bind: (...values) => statement(client, sql, values.map(value => value === undefined ? null : value)),
    all: run,
    run,
    first: async column => {
      const { results } = await run();
      const row = results[0] ?? null;
      return row && column ? row[column] : row;
    }
  };
}

export function createD1(client) {
  return {
    prepare: sql => statement(client, sql),
    async batch(statements) {
      const resultSets = await client.batch(
        statements.map(({ sql, args }) => ({ sql, args })),
        "write"
      );
      return resultSets.map(toD1Result);
    }
  };
}
