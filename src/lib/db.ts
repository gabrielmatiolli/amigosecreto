import { randomBytes } from 'node:crypto';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Consulta = <T = any>(texto: string, params?: unknown[]) => Promise<T[]>;

interface Driver {
  query: Consulta;
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: Consulta) => Promise<T>): Promise<T>;
}

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS jogo (
  id int PRIMARY KEY CHECK (id = 1),
  nome text NOT NULL DEFAULT 'Amigo Secreto da Família Matiolli',
  codigo_convite text NOT NULL,
  min_participantes int NOT NULL DEFAULT 3,
  data_limite timestamptz,
  inscricoes_encerradas boolean NOT NULL DEFAULT false,
  valor_min numeric(10,2),
  valor_max numeric(10,2),
  data_festa timestamptz,
  local_festa text,
  sorteado_em timestamptz
);
CREATE TABLE IF NOT EXISTS participantes (
  id serial PRIMARY KEY,
  nome text NOT NULL,
  contato text NOT NULL UNIQUE,
  tipo_contato text NOT NULL,
  pin_hash text NOT NULL,
  tentativas int NOT NULL DEFAULT 0,
  bloqueado_ate timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS desejos (
  id serial PRIMARY KEY,
  participante_id int NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  url text,
  loja text,
  preco text,
  observacao text,
  imagem bytea,
  imagem_tipo text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS desejos_participante_idx ON desejos (participante_id);
CREATE TABLE IF NOT EXISTS sorteio (
  doador_id int PRIMARY KEY REFERENCES participantes(id) ON DELETE CASCADE,
  recebedor_id int NOT NULL UNIQUE REFERENCES participantes(id) ON DELETE CASCADE,
  revelado_em timestamptz
);
`;

async function criarDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let d: Driver;

  if (url) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, max: 3 });
    d = {
      query: async (t, p) => (await pool.query(t, p as any[])).rows,
      exec: async (sql) => {
        await pool.query(sql);
      },
      tx: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn(async (t, p) => (await c.query(t, p as any[])).rows);
          await c.query('COMMIT');
          return r;
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      },
    };
  } else {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL não configurada. Defina a conexão do PostgreSQL nas variáveis de ambiente.');
    }
    // Desenvolvimento local sem Postgres instalado: Postgres embutido (PGlite).
    // Fica em node_modules/.cache para o Next não recompilar a cada gravação do banco.
    const { PGlite } = await import('@electric-sql/pglite');
    const { mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const pasta = join(process.cwd(), 'node_modules', '.cache', 'amigo-secreto-pglite');
    mkdirSync(pasta, { recursive: true });
    const db = new PGlite(pasta);
    d = {
      query: async (t, p) => (await db.query(t, p as any[])).rows as any[],
      exec: async (sql) => {
        await db.exec(sql);
      },
      tx: (fn) =>
        db.transaction((t) => fn(async (texto, p) => (await t.query(texto, p as any[])).rows as any[])) as Promise<any>,
    };
  }

  await d.exec(ESQUEMA);
  await d.query('INSERT INTO jogo (id, codigo_convite) VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [
    novoCodigo(),
  ]);
  return d;
}

export function novoCodigo() {
  return randomBytes(9).toString('base64url');
}

const g = globalThis as unknown as { __amigoSecretoDb?: Promise<Driver> };

function driver() {
  if (!g.__amigoSecretoDb) {
    g.__amigoSecretoDb = criarDriver().catch((e) => {
      g.__amigoSecretoDb = undefined;
      throw e;
    });
  }
  return g.__amigoSecretoDb;
}

export const query: Consulta = async (t, p) => (await driver()).query(t, p);

export async function tx<T>(fn: (q: Consulta) => Promise<T>): Promise<T> {
  return (await driver()).tx(fn);
}
