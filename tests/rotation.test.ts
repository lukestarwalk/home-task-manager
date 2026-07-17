import { describe, expect, it } from "vitest";
import {
  assigneeForDate,
  computeSchedule,
  dayNumber,
  isoFromDayNumber,
  isOnVacation,
} from "../src/shared/rotation";
import type { Person, Vacation } from "../src/shared/types";

const people: Person[] = [
  { id: 1, name: "Alicia", position: 0 },
  { id: 2, name: "Ediany", position: 1 },
  { id: 3, name: "Tiago", position: 2 },
];

const ANCHOR = "2024-01-01"; // Alicia is responsible on the anchor date

const names = (rows: ReturnType<typeof computeSchedule>) =>
  rows.map((r) => (r.person ? r.person.name : null));

describe("day number helpers", () => {
  it("round-trips through isoFromDayNumber", () => {
    expect(isoFromDayNumber(dayNumber("2026-07-16"))).toBe("2026-07-16");
  });

  it("advances by exactly one per day", () => {
    expect(dayNumber("2024-01-02") - dayNumber("2024-01-01")).toBe(1);
  });
});

describe("plain rotation (no vacations)", () => {
  it("assigns the first person on the anchor date", () => {
    expect(assigneeForDate("2024-01-01", people, [], ANCHOR).person?.name).toBe("Alicia");
  });

  it("advances one person per day and wraps around", () => {
    expect(names(computeSchedule("2024-01-01", 4, people, [], ANCHOR))).toEqual([
      "Alicia",
      "Ediany",
      "Tiago",
      "Alicia",
    ]);
  });
});

describe("vacation coverage (fair queue)", () => {
  it("passes a scheduled person's day to the next available person", () => {
    // Alicia's day (anchor) — she is on vacation, so Ediany covers.
    const vac: Vacation[] = [{ id: 1, personId: 1, startDate: "2024-01-01", endDate: "2024-01-01" }];
    const a = assigneeForDate("2024-01-01", people, vac, ANCHOR);
    expect(a.person?.name).toBe("Ediany");
    expect(a.covering?.name).toBe("Alicia");
  });

  it("does not serve a covered person twice in a row (pointer advances past them)", () => {
    // Alicia out on the anchor day -> Ediany covers day 0; day 1 continues to Tiago,
    // NOT back to Ediany, and Alicia returns on day 2.
    const vac: Vacation[] = [{ id: 1, personId: 1, startDate: "2024-01-01", endDate: "2024-01-01" }];
    expect(names(computeSchedule("2024-01-01", 3, people, vac, ANCHOR))).toEqual([
      "Ediany",
      "Tiago",
      "Alicia",
    ]);
  });

  it("skips multiple consecutive people on vacation", () => {
    const vac: Vacation[] = [
      { id: 1, personId: 1, startDate: "2024-01-01", endDate: "2024-01-01" },
      { id: 2, personId: 2, startDate: "2024-01-01", endDate: "2024-01-01" },
    ];
    // Alicia + Ediany out -> Tiago covers the anchor day.
    const a = assigneeForDate("2024-01-01", people, vac, ANCHOR);
    expect(a.person?.name).toBe("Tiago");
    expect(a.covering?.name).toBe("Alicia");
  });

  it("marks the day as allVacation when everyone is away", () => {
    const vac: Vacation[] = people.map((p, i) => ({
      id: i + 1,
      personId: p.id,
      startDate: "2024-01-01",
      endDate: "2024-01-05",
    }));
    const a = assigneeForDate("2024-01-01", people, vac, ANCHOR);
    expect(a.person).toBeNull();
    expect(a.allVacation).toBe(true);
  });

  it("does not mark covering when the scheduled person is available", () => {
    expect(assigneeForDate("2024-01-02", people, [], ANCHOR).covering).toBeNull();
  });

  it("produces the same slice whether requested directly or as a tail", () => {
    const vac: Vacation[] = [{ id: 1, personId: 2, startDate: "2024-01-05", endDate: "2024-01-06" }];
    const full = computeSchedule("2024-01-01", 10, people, vac, ANCHOR);
    const tail = computeSchedule("2024-01-05", 6, people, vac, ANCHOR);
    expect(names(tail)).toEqual(names(full.slice(4)));
  });
});

describe("isOnVacation", () => {
  const vac: Vacation[] = [{ id: 1, personId: 1, startDate: "2024-03-10", endDate: "2024-03-15" }];
  it("is inclusive of both endpoints", () => {
    expect(isOnVacation(1, "2024-03-10", vac)).toBe(true);
    expect(isOnVacation(1, "2024-03-15", vac)).toBe(true);
    expect(isOnVacation(1, "2024-03-09", vac)).toBe(false);
    expect(isOnVacation(1, "2024-03-16", vac)).toBe(false);
  });
});

describe("computeSchedule", () => {
  it("produces one assignment per requested day", () => {
    expect(computeSchedule("2024-01-01", 7, people, [], ANCHOR)).toHaveLength(7);
  });

  it("returns null people for an empty roster", () => {
    const s = computeSchedule("2024-01-01", 3, [], [], ANCHOR);
    expect(s.every((a) => a.person === null && !a.allVacation)).toBe(true);
  });
});
