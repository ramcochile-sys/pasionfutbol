// Aplica las migraciones de Pasion-Futbol-1/drizzle a Turso (una sola vez cada una).
// Uso:  vercel env pull .env.local && node --env-file=.env.local scripts/migrate-turso.mjs
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function applyMigrations(client, dir = "Pasion-Futbol-1/drizzle", log = console.log) {
  await client.execute("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)");
  const done = new Set((await client.execute("SELECT name FROM _migrations")).rows.map(row => row[0]));
  const files = (await readdir(dir)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  const applied = [];
  for (const file of files) {
    if (done.has(file)) { log(`= ${file} (ya aplicada)`); continue; }
    const sql = (await readFile(`${dir}/${file}`, "utf8")).replaceAll("--> statement-breakpoint", "");
    await client.executeMultiple(sql);
    await client.execute({ sql: "INSERT INTO _migrations (name, applied_at) VALUES (?,?)", args: [file, Math.floor(Date.now() / 1000)] });
    log(`+ ${file}`);
    applied.push(file);
  }
  return applied;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
  if (!url || !authToken) { console.error("Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN."); process.exit(1); }
  const { createClient } = await import("@libsql/client/web");
  const applied = await applyMigrations(createClient({ url, authToken }));
  console.log(applied.length ? `Listo: ${applied.length} migración(es) aplicada(s).` : "Nada que aplicar: la base ya está al día.");
}
