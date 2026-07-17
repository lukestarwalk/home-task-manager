import type { AppState, Person, Vacation, Settings } from "../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  getState: () => request<AppState>("/state"),

  addPerson: (name: string) =>
    request<Person>("/people", { method: "POST", body: JSON.stringify({ name }) }),

  renamePerson: (id: number, name: string) =>
    request<Person>(`/people/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),

  removePerson: (id: number) => request<void>(`/people/${id}`, { method: "DELETE" }),

  reorderPeople: (orderedIds: number[]) =>
    request<Person[]>("/people/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedIds }),
    }),

  addVacation: (personId: number, startDate: string, endDate: string) =>
    request<Vacation>("/vacations", {
      method: "POST",
      body: JSON.stringify({ personId, startDate, endDate }),
    }),

  removeVacation: (id: number) => request<void>(`/vacations/${id}`, { method: "DELETE" }),

  setAnchorDate: (anchorDate: string) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify({ anchorDate }) }),
};
