# Amigo Secreto · Família Matiolli

Site de amigo secreto de Natal: convite por link, lista de desejos com foto do produto e sorteio individual.

## Como funciona

1. O administrador entra em `/admin` (senha em `ADMIN_PASSWORD`), define o mínimo de participantes, a data limite, a faixa de valor e a festa, e envia o **link de convite**.
2. Cada pessoa abre o link, informa nome, telefone ou e-mail e cria um PIN de 4 números (usado para voltar ao site).
3. Cada um monta a lista de desejos colando links de lojas (Shopee, Amazon, Mercado Livre…). O servidor consulta a página, salva título, preço e **a foto do produto no banco**.
4. Quando a data limite passa (ou o administrador encerra as inscrições) **e** há o mínimo de participantes, cada pessoa clica em **Sortear** e vê apenas o seu amigo secreto. O administrador não vê os pares.

## Rodar no computador

```bash
npm install
npm run dev
```

Sem `DATABASE_URL`, o projeto usa um Postgres embutido (PGlite) guardado em `node_modules/.cache/amigo-secreto-pglite` — só para desenvolvimento. A senha local do admin está em `.env.local`.

## Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub e importe o projeto em https://vercel.com/new (ou use `npx vercel`).
2. No projeto da Vercel, abra **Storage → Create Database → Neon (Postgres)** e conecte ao projeto. Isso cria a variável `DATABASE_URL` automaticamente.
3. Em **Settings → Environment Variables**, adicione:
   - `ADMIN_PASSWORD` — a senha do painel `/admin`
   - `SESSION_SECRET` — um texto aleatório longo (veja `.env.example`)
4. Faça o deploy. As tabelas são criadas sozinhas no primeiro acesso (`src/lib/db.ts`).

## Estrutura

- `src/lib/db.ts` — conexão e esquema do PostgreSQL (`jogo`, `participantes`, `desejos`, `sorteio`)
- `src/lib/jogo.ts` — regras do jogo e do sorteio
- `src/lib/preview.ts` — consulta à página do produto e download da imagem
- `src/lib/auth.ts` — sessão por cookie assinado, PIN e senha do admin
- `src/app/actions.ts` — todas as ações (cadastro, login, desejos, sorteio, admin)
