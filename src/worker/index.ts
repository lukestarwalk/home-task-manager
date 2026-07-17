import { Hono } from "hono";
import type { Context } from "hono";
import type { Person, Vacation, Settings } from "../shared/types";
import { computeSchedule, todayIso } from "../shared/rotation";

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

/** Best-effort JSON body parse; yields {} for empty or invalid bodies. */
async function readBody<T>(c: Context): Promise<Partial<T>> {
  return (await c.req.json().catch(() => ({}))) as Partial<T>;
}

/* ------------------------------------------------------------------ */
/* Row mappers (snake_case DB rows -> camelCase domain objects)        */
/* ------------------------------------------------------------------ */

interface PersonRow { id: number; name: string; position: number; }
interface VacationRow { id: number; person_id: number; start_date: string; end_date: string; }

const toPerson = (r: PersonRow): Person => ({ id: r.id, name: r.name, position: r.position });
const toVacation = (r: VacationRow): Vacation => ({
  id: r.id,
  personId: r.person_id,
  startDate: r.start_date,
  endDate: r.end_date,
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function loadPeople(db: D1Database): Promise<Person[]> {
  const { results } = await db
    .prepare("SELECT id, name, position FROM people ORDER BY position ASC")
    .all<PersonRow>();
  return results.map(toPerson);
}

async function loadVacations(db: D1Database): Promise<Vacation[]> {
  const { results } = await db
    .prepare("SELECT id, person_id, start_date, end_date FROM vacations ORDER BY start_date ASC")
    .all<VacationRow>();
  return results.map(toVacation);
}

async function loadSettings(db: D1Database): Promise<Settings> {
  const row = await db
    .prepare("SELECT anchor_date FROM settings WHERE id = 1")
    .first<{ anchor_date: string }>();
  return { anchorDate: row?.anchor_date ?? "2024-01-01" };
}

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

const api = new Hono<{ Bindings: Bindings }>();

// Full application state in one round trip.
api.get("/state", async (c) => {
  const [people, vacations, settings] = await Promise.all([
    loadPeople(c.env.DB),
    loadVacations(c.env.DB),
    loadSettings(c.env.DB),
  ]);
  return c.json({ people, vacations, settings });
});

// Server-computed schedule (handy for integrations / cron / notifications).
api.get("/schedule", async (c) => {
  const from = c.req.query("from") ?? todayIso();
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 14), 1), 90);
  if (!ISO_DATE.test(from)) return c.json({ error: "invalid 'from' date" }, 400);

  const [people, vacations, settings] = await Promise.all([
    loadPeople(c.env.DB),
    loadVacations(c.env.DB),
    loadSettings(c.env.DB),
  ]);
  return c.json(computeSchedule(from, days, people, vacations, settings.anchorDate));
});

// Add a person to the end of the rotation.
api.post("/people", async (c) => {
  const body = await readBody<{ name: string }>(c);
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ error: "name is required" }, 400);

  const max = await c.env.DB
    .prepare("SELECT COALESCE(MAX(position), -1) AS m FROM people")
    .first<{ m: number }>();
  const position = (max?.m ?? -1) + 1;

  const row = await c.env.DB
    .prepare("INSERT INTO people (name, position) VALUES (?, ?) RETURNING id, name, position")
    .bind(name, position)
    .first<PersonRow>();
  return c.json(toPerson(row!), 201);
});

// Rename a person.
api.patch("/people/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await readBody<{ name: string }>(c);
  const name = (body.name ?? "").trim();
  if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
  if (!name) return c.json({ error: "name is required" }, 400);

  const row = await c.env.DB
    .prepare("UPDATE people SET name = ? WHERE id = ? RETURNING id, name, position")
    .bind(name, id)
    .first<PersonRow>();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(toPerson(row));
});

// Remove a person (their vacations cascade away).
api.delete("/people/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
  await c.env.DB.prepare("DELETE FROM people WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

// Reorder the rotation. Body: { orderedIds: number[] }.
api.post("/people/reorder", async (c) => {
  const body = await readBody<{ orderedIds: number[] }>(c);
  const ids = body.orderedIds;
  if (!Array.isArray(ids) || ids.some((x) => !Number.isInteger(x))) {
    return c.json({ error: "orderedIds must be an array of ids" }, 400);
  }
  const stmt = c.env.DB.prepare("UPDATE people SET position = ? WHERE id = ?");
  await c.env.DB.batch(ids.map((id, i) => stmt.bind(i, id)));
  return c.json(await loadPeople(c.env.DB));
});

// Add a vacation period. Body: { personId, startDate, endDate }.
api.post("/vacations", async (c) => {
  const body = await readBody<{ personId: number; startDate: string; endDate: string }>(c);
  const { personId, startDate, endDate } = body;

  if (!Number.isInteger(personId)) return c.json({ error: "invalid personId" }, 400);
  if (!startDate || !ISO_DATE.test(startDate)) return c.json({ error: "invalid startDate" }, 400);
  if (!endDate || !ISO_DATE.test(endDate)) return c.json({ error: "invalid endDate" }, 400);
  if (endDate < startDate) return c.json({ error: "endDate before startDate" }, 400);

  const row = await c.env.DB
    .prepare(
      "INSERT INTO vacations (person_id, start_date, end_date) VALUES (?, ?, ?) " +
        "RETURNING id, person_id, start_date, end_date",
    )
    .bind(personId, startDate, endDate)
    .first<VacationRow>();
  return c.json(toVacation(row!), 201);
});

// Remove a vacation period.
api.delete("/vacations/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "invalid id" }, 400);
  await c.env.DB.prepare("DELETE FROM vacations WHERE id = ?").bind(id).run();
  return c.body(null, 204);
});

// Update the rotation anchor date. Body: { anchorDate }.
api.put("/settings", async (c) => {
  const body = await readBody<{ anchorDate: string }>(c);
  const anchorDate = body.anchorDate;
  if (!anchorDate || !ISO_DATE.test(anchorDate)) {
    return c.json({ error: "invalid anchorDate" }, 400);
  }
  await c.env.DB
    .prepare("UPDATE settings SET anchor_date = ? WHERE id = 1")
    .bind(anchorDate)
    .run();
  return c.json({ anchorDate } satisfies Settings);
});

app.route("/api", api);

// Safety net: if a non-API request ever reaches the Worker, serve the SPA.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
