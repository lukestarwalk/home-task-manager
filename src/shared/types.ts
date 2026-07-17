export interface Person {
  id: number;
  name: string;
  /** Order within the rotation; lower comes first. */
  position: number;
}

export interface Vacation {
  id: number;
  personId: number;
  /** Inclusive YYYY-MM-DD. */
  startDate: string;
  /** Inclusive YYYY-MM-DD. */
  endDate: string;
}

export interface Settings {
  /** Day 0 of the rotation (YYYY-MM-DD): first person is responsible on this date. */
  anchorDate: string;
}

export interface AppState {
  people: Person[];
  vacations: Vacation[];
  settings: Settings;
}
