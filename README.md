# Tarefas de Casa

App web para saber quem é responsável pelas tarefas da casa em cada dia. A
rotação é **circular**: quem estiver de férias é automaticamente coberto pela
próxima pessoa da lista.

## Stack

- **Frontend:** React + Vite + Tailwind CSS (SPA, sem SSR → arranque rápido)
- **Backend:** [Hono](https://hono.dev/) num único **Cloudflare Worker**
- **Dados:** Cloudflare **D1** (SQLite) — guarda apenas pessoas e férias
- **Lógica de rotação:** módulo puro e testável em `src/shared/rotation.ts`,
  partilhado entre servidor e cliente (o UI recalcula tudo instantaneamente)

Sem login: quem tiver o link vê e edita.

## Estrutura

```
src/
  shared/    lógica de rotação + tipos (usados no servidor e no cliente)
  worker/    API Hono (Cloudflare Worker)
  client/    SPA React
tests/       testes unitários da rotação (vitest)
schema.sql   esquema da base de dados D1
```

## Desenvolvimento

```bash
npm install

# Cria a base de dados D1 e cola o database_id em wrangler.jsonc:
npx wrangler d1 create home-task-manager-db

# Cria as tabelas na D1 local:
npm run db:local

# Arranca cliente + worker (runtime workerd via Vite):
npm run dev
```

Testes da lógica de rotação:

```bash
npm test
```

## Deploy (Cloudflare)

```bash
npm run db:remote   # aplica o esquema à D1 de produção (uma vez)
npm run deploy      # build + wrangler deploy
```

## Como funciona a rotação

`anchor_date` (em `settings`) fixa o dia 0: nessa data a primeira pessoa
(menor `position`) é a responsável. Para qualquer data:

1. `índice = (dias desde a âncora) mod nº_de_pessoas`
2. se essa pessoa estiver de férias, passa para a próxima disponível no círculo
3. se toda a gente estiver de férias, o dia fica sem responsável

Como é determinística, não é preciso guardar nada por dia — basta a lista de
pessoas e os períodos de férias.

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/state` | pessoas + férias + settings |
| GET | `/api/schedule?from=YYYY-MM-DD&days=14` | escala calculada |
| POST | `/api/people` | adicionar pessoa `{ name }` |
| PATCH | `/api/people/:id` | renomear `{ name }` |
| DELETE | `/api/people/:id` | remover pessoa |
| POST | `/api/people/reorder` | reordenar `{ orderedIds }` |
| POST | `/api/vacations` | adicionar férias `{ personId, startDate, endDate }` |
| DELETE | `/api/vacations/:id` | remover férias |
| PUT | `/api/settings` | definir `{ anchorDate }` |
