/**
 * Validates an ISO 8601 date string and returns a Date object, or null if invalid.
 */
export function parseISODate(value: string): Date | null {
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date;
}

/**
 * Validates that a string is a valid ISO 8601 date.
 */
export function isValidISODate(value: string): boolean {
  return parseISODate(value) !== null;
}

/**
 * Converts a Date to an ISO 8601 string (YYYY-MM-DDTHH:mm:ss.sssZ).
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Parses a date string or returns null. Accepts ISO 8601 format.
 */
export function parseDateOrNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const date = parseISODate(value);
  return date ? toISOString(date) : null;
}

/** Local time of day [hours, minutes, seconds, ms] applied to a bare YYYY-MM-DD date. */
export type TimeOfDay = readonly [number, number, number?, number?];

export const START_OF_DAY: TimeOfDay = [0, 0];
export const END_OF_DAY: TimeOfDay = [23, 59, 59, 999];

/** Times OmniFocus uses by default when a date is picked without a time. */
export const TASK_DATE_TIMES: Record<string, TimeOfDay> = {
  deferDate: START_OF_DAY,
  plannedDate: [9, 0],
  dueDate: [17, 0],
};

/** A bare date in a range filter covers that whole local day, since the bounds are inclusive. */
export const FILTER_DATE_TIMES: Record<string, TimeOfDay> = {
  dueAfter: START_OF_DAY,
  dueBefore: END_OF_DAY,
  deferAfter: START_OF_DAY,
  deferBefore: END_OF_DAY,
  plannedAfter: START_OF_DAY,
  plannedBefore: END_OF_DAY,
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converts a bare YYYY-MM-DD into a UTC ISO string for that local date and time of day.
 * Per the JS spec, new Date("YYYY-MM-DD") is UTC midnight, which is the previous evening
 * west of UTC. Anything else (a date-time, with or without offset) is returned unchanged.
 * Returns null for an impossible calendar date such as 2026-02-30.
 */
export function normalizeDateOnly(value: string, time: TimeOfDay): string | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return value;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const [hours, minutes, seconds = 0, ms = 0] = time;
  const date = new Date(year, month, day, hours, minutes, seconds, ms);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date.toISOString();
}

/**
 * Returns a copy of args with each bare YYYY-MM-DD field converted to local time via normalizeDateOnly.
 * Throws if a field holds an impossible calendar date.
 */
export function normalizeDateArgs<T extends object>(args: T, fields: Record<string, TimeOfDay>): T {
  const result = { ...args } as Record<string, unknown>;
  for (const [field, time] of Object.entries(fields)) {
    const value = result[field];
    if (typeof value !== "string" || value === "") continue;
    const normalized = normalizeDateOnly(value, time);
    if (normalized === null) throw new Error(`Invalid date for '${field}': ${value}`);
    result[field] = normalized;
  }
  return result as T;
}

/**
 * Validates all date-string fields in an args object.
 * Throws if any specified field contains an invalid date string.
 * Skips undefined/null values (those are valid — they mean "no date" or "clear date").
 */
export function validateDateArgs(args: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const value = args[field];
    if (typeof value === "string" && !isValidISODate(value)) {
      throw new Error(`Invalid date for '${field}': ${value}`);
    }
  }
}
