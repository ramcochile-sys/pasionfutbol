CREATE TABLE IF NOT EXISTS catalog_admin_users (
  username TEXT PRIMARY KEY NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL
);
