-- Tablas que usa la tienda PASIÓN FÚTBOL (Turso / SQLite).
-- Se puede ejecutar más de una vez: no borra ni cambia datos existentes.

-- Productos editados o creados desde /admin (precio en pesos chilenos, enteros).
-- categories y sizes guardan listas en formato JSON, por ejemplo: ["camisetas"] y ["S","M","L"].
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  categories  TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  sizes       TEXT NOT NULL DEFAULT '[]',
  image       TEXT NOT NULL
);

-- Administradores del panel /admin (contraseña guardada con salt y hash).
CREATE TABLE IF NOT EXISTS catalog_admin_users (
  username TEXT PRIMARY KEY,
  salt     TEXT NOT NULL,
  hash     TEXT NOT NULL
);

-- Sesiones activas del panel. expires_at va en segundos (hora Unix).
CREATE TABLE IF NOT EXISTS catalog_admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Control de intentos de inicio de sesión por dirección (máximo 5 cada 15 minutos).
CREATE TABLE IF NOT EXISTS catalog_login_attempts (
  address_hash TEXT PRIMARY KEY,
  attempts     INTEGER NOT NULL DEFAULT 1,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON catalog_admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_attempts_expires ON catalog_login_attempts (expires_at);
