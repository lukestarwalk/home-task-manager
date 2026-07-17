import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AppState } from "../shared/types";
import { computeSchedule, todayIso } from "../shared/rotation";
import { api } from "./api";

const DAYS = 14;

/* -------------------------------------------------------------------- */
/* Date formatting (pt-PT, matching the design)                          */
/* -------------------------------------------------------------------- */

function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function wd(d: Date, style: "long" | "short"): string {
  return new Intl.DateTimeFormat("pt-PT", { weekday: style }).format(d).replace(".", "").replace("-feira", "");
}
function mon(d: Date, style: "long" | "short"): string {
  return new Intl.DateTimeFormat("pt-PT", { month: style }).format(d).replace(".", "");
}
function fmtShort(d: Date): string {
  return `${wd(d, "short")}, ${d.getDate()} ${mon(d, "short")}`;
}
function fmtDayIso(iso: string): string {
  const d = localDate(iso);
  return `${d.getDate()} ${mon(d, "short")}`;
}

/* -------------------------------------------------------------------- */
/* Icons (inline SVG, from the design)                                   */
/* -------------------------------------------------------------------- */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth={2} {...stroke}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    <path d="M10 21v-6h4v6" />
  </svg>
);
const SunIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth={2} {...stroke}>
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2.5" /><path d="M12 19v2.5" /><path d="M4.5 12H2" /><path d="M22 12h-2.5" />
    <path d="M5.3 5.3l1.8 1.8" /><path d="M16.9 16.9l1.8 1.8" /><path d="M18.7 5.3l-1.8 1.8" /><path d="M7.1 16.9l-1.8 1.8" />
  </svg>
);
const MoonIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth={2} {...stroke}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
  </svg>
);
const ChevronUp = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth={2.5} {...stroke}><path d="M18 15l-6-6-6 6" /></svg>
);
const ChevronDown = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth={2.5} {...stroke}><path d="M6 9l6 6 6-6" /></svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth={2.5} {...stroke}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
const GripIcon = () => (
  <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor">
    <circle cx="4.5" cy="4" r="1.5" /><circle cx="9.5" cy="4" r="1.5" />
    <circle cx="4.5" cy="9" r="1.5" /><circle cx="9.5" cy="9" r="1.5" />
    <circle cx="4.5" cy="14" r="1.5" /><circle cx="9.5" cy="14" r="1.5" />
  </svg>
);
const VacIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" strokeWidth={2} {...stroke}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v1.5" /><path d="M12 19.5V21" /><path d="M4.5 12H3" /><path d="M21 12h-1.5" />
    <path d="M5.6 5.6l1.1 1.1" /><path d="M17.3 17.3l1.1 1.1" /><path d="M18.4 5.6l-1.1 1.1" /><path d="M6.7 17.3l-1.1 1.1" />
  </svg>
);
const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth={3} {...stroke}><path d="M20 6 9 17l-5-5" /></svg>
);

/* -------------------------------------------------------------------- */
/* Shared styles                                                         */
/* -------------------------------------------------------------------- */

const CARD: CSSProperties = {
  background: "var(--glass)",
  backdropFilter: "blur(24px) saturate(1.5)",
  WebkitBackdropFilter: "blur(24px) saturate(1.5)",
  border: "1px solid var(--glass-border)",
  borderRadius: "22px",
  boxShadow: "var(--shadow)",
  padding: "20px",
};
const H2: CSSProperties = { margin: 0, fontSize: "16px", fontWeight: 800, letterSpacing: "-.01em" };
const BADGE_AMBER: CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  padding: "3px 8px",
  borderRadius: "999px",
  background: "var(--amber-bg)",
  color: "var(--amber-text)",
  letterSpacing: ".03em",
};

/* -------------------------------------------------------------------- */
/* Theme                                                                 */
/* -------------------------------------------------------------------- */

type Theme = "claro" | "escuro";
function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || "claro",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("tarefas-casa-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "escuro" ? "claro" : "escuro")) };
}

/* -------------------------------------------------------------------- */
/* App                                                                   */
/* -------------------------------------------------------------------- */

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme, toggle } = useTheme();
  const dark = theme === "escuro";

  const refresh = async () => {
    try {
      setState(await api.getState());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const today = todayIso();
  const schedule = useMemo(() => {
    if (!state) return [];
    return computeSchedule(today, DAYS, state.people, state.vacations, state.settings.anchorDate);
  }, [state, today]);
  const hero = schedule[0] ?? null;

  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px 40px" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "8px 4px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  width: "38px", height: "38px", borderRadius: "12px", background: "var(--glass)",
                  border: "1px solid var(--glass-border)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                  boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--teal-text)",
                }}
              >
                <HomeIcon />
              </span>
              <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 800, letterSpacing: "-.03em" }}>Tarefas de Casa</h1>
            </div>
            <p style={{ margin: 0, fontSize: "15px", color: "var(--muted)", fontWeight: 500 }}>
              Quem é responsável pelas tarefas em cada dia.
            </p>
          </div>
          <button
            className="theme-btn"
            onClick={toggle}
            aria-label={dark ? "Mudar para modo claro" : "Mudar para modo escuro"}
            title={dark ? "Mudar para modo claro" : "Mudar para modo escuro"}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        {error && (
          <div style={{ ...CARD, padding: "12px 16px", borderColor: "rgba(220,80,60,.4)", color: "#c0432e", fontSize: "14px", fontWeight: 600 }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "15px" }}>A carregar…</p>
        ) : (
          <>
            <HeroCard hero={hero} today={today} />
            <ScheduleCard schedule={schedule} today={today} />
            {state && <PeopleCard state={state} run={run} />}
            {state && <VacationsCard state={state} run={run} />}
          </>
        )}

        <footer style={{ textAlign: "center", padding: "4px 20px 0" }}>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)", fontWeight: 500 }}>
            Rotação circular · quem estiver de férias é coberto pela próxima pessoa.
          </p>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */

function HeroCard({ hero, today }: { hero: ReturnType<typeof computeSchedule>[number] | null; today: string }) {
  const d = localDate(today);
  const heroDate = `${wd(d, "long")}, ${d.getDate()} ${mon(d, "long")}`;
  return (
    <section
      aria-label="Hoje"
      style={{
        borderRadius: "24px", padding: "28px 24px", color: "#ffffff",
        background: "linear-gradient(140deg,rgba(13,148,136,.88) 0%,rgba(15,94,89,.92) 60%,rgba(19,78,74,.95) 100%)",
        backdropFilter: "blur(24px) saturate(1.4)", WebkitBackdropFilter: "blur(24px) saturate(1.4)",
        border: "1px solid rgba(255,255,255,.28)",
        boxShadow: "0 16px 40px rgba(13,90,82,.35),inset 0 1px 0 rgba(255,255,255,.30)",
        position: "relative", overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: "-70px", right: "-70px", width: "220px", height: "220px", borderRadius: "50%", background: "rgba(255,255,255,.10)", filter: "blur(6px)" }} />
      <div style={{ position: "absolute", bottom: "-90px", left: "-50px", width: "200px", height: "200px", borderRadius: "50%", background: "rgba(255,255,255,.07)", filter: "blur(8px)" }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(255,255,255,.78)" }}>
          Hoje · {heroDate}
        </div>
        {hero?.person ? (
          <>
            <div style={{ fontSize: "44px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-.03em" }}>{hero.person.name}</div>
            {hero.covering && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "2px" }}>
                <span style={{ fontSize: "12px", fontWeight: 800, padding: "4px 10px", borderRadius: "999px", background: "rgba(252,211,77,.92)", color: "#78350f", letterSpacing: ".03em" }}>
                  cobertura
                </span>
                <span style={{ fontSize: "15px", color: "rgba(255,255,255,.88)", fontWeight: 500 }}>
                  A cobrir {hero.covering.name}, que está de férias.
                </span>
              </div>
            )}
          </>
        ) : hero?.allVacation ? (
          <div style={{ fontSize: "28px", fontWeight: 800, lineHeight: 1.2 }}>Toda a gente está de férias.</div>
        ) : (
          <div style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.3, color: "rgba(255,255,255,.92)" }}>
            Ainda não há pessoas na rotação.
          </div>
        )}
      </div>
    </section>
  );
}

function ScheduleCard({ schedule, today }: { schedule: ReturnType<typeof computeSchedule>; today: string }) {
  return (
    <section aria-label="Próximos dias" style={CARD}>
      <h2 style={{ ...H2, marginBottom: "12px" }}>Próximos dias</h2>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {schedule.map((a) => {
          const isToday = a.date === today;
          const d = localDate(a.date);
          const label = isToday ? `hoje, ${d.getDate()} ${mon(d, "short")}` : fmtShort(d);
          const name = a.person ? a.person.name : a.allVacation ? "todos de férias" : "—";
          return (
            <div
              key={a.date}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                padding: isToday ? "10px 12px" : "10px 4px",
                background: isToday ? "var(--teal-soft)" : "transparent",
                borderRadius: isToday ? "12px" : "0",
                borderBottom: isToday ? "none" : "1px solid var(--line)",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: isToday ? 800 : 600, color: isToday ? "var(--teal-text)" : "var(--muted)" }}>
                {label}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {a.covering && <span style={BADGE_AMBER}>cobertura</span>}
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: isToday ? 800 : 700,
                    color: a.person ? (isToday ? "var(--teal-text)" : "var(--text)") : "var(--muted)",
                    fontStyle: a.person ? "normal" : "italic",
                  }}
                >
                  {name}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PeopleCard({ state, run }: { state: AppState; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [newName, setNewName] = useState("");
  const people = state.people;

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= people.length) return;
    const ids = people.map((p) => p.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    void run(() => api.reorderPeople(ids));
  };
  const add = () => {
    const n = newName.trim();
    if (!n) return;
    void run(() => api.addPerson(n)).then(() => setNewName(""));
  };

  return (
    <section aria-label="Pessoas" style={{ ...CARD, display: "flex", flexDirection: "column", gap: "14px" }}>
      <h2 style={H2}>Pessoas · ordem da rotação</h2>

      {people.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {people.map((p, i) => (
            <div key={p.id} className="row-card">
              <span aria-hidden style={{ color: "var(--muted)", cursor: "grab", display: "flex", alignItems: "center" }}>
                <GripIcon />
              </span>
              <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "var(--teal-soft)", color: "var(--teal-text)", fontSize: "13px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, fontSize: "16px", fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </span>
              <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Mover para cima"><ChevronUp /></button>
              <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === people.length - 1} aria-label="Mover para baixo"><ChevronDown /></button>
              <button className="icon-btn danger" onClick={() => run(() => api.removePerson(p.id))} aria-label="Remover pessoa"><XIcon /></button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>Adiciona a primeira pessoa abaixo.</p>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Nome da pessoa…"
          aria-label="Nome da pessoa"
        />
        <button className="primary-btn" onClick={add} disabled={!newName.trim()}>Adicionar</button>
      </div>
    </section>
  );
}

function VacationsCard({ state, run }: { state: AppState; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const { people, vacations } = state;
  const [personId, setPersonId] = useState<number | "">("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? "?";
  const selectedName = personId === "" ? "Pessoa…" : nameOf(Number(personId));
  const disabled = personId === "" || !start || !end;

  const add = () => {
    if (disabled) return;
    let a = start;
    let b = end;
    if (b < a) [a, b] = [b, a];
    void run(() => api.addVacation(Number(personId), a, b)).then(() => {
      setPersonId("");
      setStart("");
      setEnd("");
    });
  };

  return (
    <section aria-label="Férias" style={{ ...CARD, display: "flex", flexDirection: "column", gap: "14px" }}>
      <h2 style={H2}>Férias</h2>

      {vacations.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {vacations.map((v) => (
            <div key={v.id} className="row-card">
              <span aria-hidden style={{ color: "var(--amber-text)", display: "flex", alignItems: "center" }}>
                <VacIcon />
              </span>
              <span style={{ flex: 1, fontSize: "15px", fontWeight: 700, minWidth: 0 }}>
                {nameOf(v.personId)}{" "}
                <span style={{ fontWeight: 500, color: "var(--muted)" }}>
                  · {fmtDayIso(v.startDate)} – {fmtDayIso(v.endDate)}
                </span>
              </span>
              <button className="icon-btn danger" onClick={() => run(() => api.removeVacation(v.id))} aria-label="Remover férias"><XIcon /></button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>Sem férias registadas.</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {/* Custom person dropdown */}
        <div style={{ position: "relative", flex: "1 1 150px" }}>
          <button
            className="field select"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={people.length === 0}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-label="Pessoa"
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: personId === "" ? "var(--muted)" : "var(--text)" }}>
              {selectedName}
            </span>
            <span style={{ display: "flex", alignItems: "center", color: "var(--muted)", transition: "transform .18s", transform: menuOpen ? "rotate(180deg)" : "none" }}>
              <ChevronDown />
            </span>
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
              <div
                role="listbox"
                style={{
                  position: "absolute", top: "52px", left: 0, right: 0, zIndex: 31,
                  background: "var(--menu)", backdropFilter: "blur(28px) saturate(1.5)", WebkitBackdropFilter: "blur(28px) saturate(1.5)",
                  border: "1px solid var(--glass-border)", borderRadius: "16px", boxShadow: "0 18px 40px rgba(12,60,55,.24)",
                  padding: "6px", maxHeight: "230px", overflow: "auto", display: "flex", flexDirection: "column", gap: "2px",
                }}
              >
                {people.map((p) => {
                  const selected = personId === p.id;
                  return (
                    <button
                      key={p.id}
                      className={selected ? "opt-btn selected" : "opt-btn"}
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setPersonId(p.id);
                        setMenuOpen(false);
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      {selected && <CheckIcon />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <input className="field date" style={{ flex: "1 1 140px" }} type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Início" />
        <input className="field date" style={{ flex: "1 1 140px" }} type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} aria-label="Fim" />
        <button className="primary-btn" style={{ flex: "1 1 120px" }} onClick={add} disabled={disabled}>Adicionar</button>
      </div>
    </section>
  );
}
