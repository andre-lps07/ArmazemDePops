CREATE TABLE IF NOT EXISTS pops (
  id        SERIAL PRIMARY KEY,
  titulo    TEXT NOT NULL,
  arquivo   TEXT NOT NULL,
  tamanho   BIGINT NOT NULL,
  criado_em TIMESTAMP DEFAULT NOW()
);