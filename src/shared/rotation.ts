import type { Person, Vacation } from "./types";

const MS_PER_DAY = 86_400_000;

/**
 * Convert a YYYY-MM-DD string into a UTC day index (days since the epoch).
 * Working in whole UTC days keeps the rotation timezone-independent.
 */
export function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Inverse of {@link dayNumber}: a UTC day index back to YYYY-MM-DD. */
export function isoFromDayNumber(day: number): string {
  const date = new Date(day * MS_PER_DAY);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isOnVacation(
  personId: number,
  isoDate: string,
  vacations: Vacation[],
): boolean {
  const day = dayNumber(isoDate);
  return vacations.some(
    (v) =>
      v.personId === personId &&
      day >= dayNumber(v.startDate) &&
      day <= dayNumber(v.endDate),
  );
}

export interface Assignment {
  date: string;
  /** Who is actually responsible; null when everyone is on vacation or the roster is empty. */
  person: Person | null;
  /** When set, `person` is standing in for this person, who is on vacation that day. */
  covering: Person | null;
  /** True when every person on the roster is on vacation that day. */
  allVacation: boolean;
}

/**
 * Build the rotation schedule for `count` consecutive days starting at `fromDate`.
 *
 * The rotation is a **queue that only advances when someone actually does a
 * chore**: each day the pointer moves to the next person, and if that person is
 * on vacation the day passes to the next available person (a "covering" day)
 * without the skipped person's turn re-appearing the next day. This is fairer
 * than a fixed calendar mapping — a covered person is not served twice in a row.
 *
 * The queue is anchored at `anchorDate` (day 0 → first person by position) and
 * replayed forward deterministically, so the same inputs always yield the same
 * schedule regardless of which slice is requested.
 */
export function computeSchedule(
  fromDate: string,
  count: number,
  people: Person[],
  vacations: Vacation[],
  anchorDate: string,
): Assignment[] {
  const ordered = [...people].sort((a, b) => a.position - b.position);
  const n = ordered.length;
  const startDay = dayNumber(fromDate);

  if (n === 0) {
    return Array.from({ length: count }, (_, k) => ({
      date: isoFromDayNumber(startDay + k),
      person: null,
      covering: null,
      allVacation: false,
    }));
  }

  // Replay the queue from the anchor (or from the requested start, if it falls
  // before the anchor) so the pointer state is consistent, then keep the tail.
  const anchorDay = dayNumber(anchorDate);
  const buildFrom = Math.min(anchorDay, startDay);
  const total = startDay - buildFrom + count;

  const all: Assignment[] = [];
  let pointer = -1;
  for (let i = 0; i < total; i++) {
    const iso = isoFromDayNumber(buildFrom + i);
    const base = (pointer + 1) % n;

    let found = -1;
    for (let k = 0; k < n; k++) {
      const idx = (base + k) % n;
      if (!isOnVacation(ordered[idx].id, iso, vacations)) {
        found = idx;
        break;
      }
    }

    if (found === -1) {
      // Everyone is on vacation: no assignee and the pointer holds its place.
      all.push({ date: iso, person: null, covering: null, allVacation: true });
      continue;
    }

    const skippedBase = isOnVacation(ordered[base].id, iso, vacations);
    all.push({
      date: iso,
      person: ordered[found],
      covering: skippedBase ? ordered[base] : null,
      allVacation: false,
    });
    pointer = found;
  }

  return all.slice(all.length - count);
}

/** Resolve who is responsible on a single date. */
export function assigneeForDate(
  isoDate: string,
  people: Person[],
  vacations: Vacation[],
  anchorDate: string,
): Assignment {
  return computeSchedule(isoDate, 1, people, vacations, anchorDate)[0];
}
