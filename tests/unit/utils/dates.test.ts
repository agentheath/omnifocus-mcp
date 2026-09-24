import { describe, it, expect } from "vitest";
import {
  parseISODate,
  isValidISODate,
  toISOString,
  parseDateOrNull,
  validateDateArgs,
  normalizeDateOnly,
  normalizeDateArgs,
  START_OF_DAY,
  END_OF_DAY,
  TASK_DATE_TIMES,
  FILTER_DATE_TIMES,
} from "../../../src/utils/dates.js";

describe("parseISODate", () => {
  it("should parse valid ISO date strings", () => {
    const date = parseISODate("2024-01-15T10:30:00.000Z");
    expect(date).toBeInstanceOf(Date);
    expect(date!.getUTCFullYear()).toBe(2024);
    expect(date!.getUTCMonth()).toBe(0);
    expect(date!.getUTCDate()).toBe(15);
  });

  it("should parse date-only strings", () => {
    const date = parseISODate("2024-06-01");
    expect(date).toBeInstanceOf(Date);
  });

  it("should return null for invalid date strings", () => {
    expect(parseISODate("not a date")).toBeNull();
    expect(parseISODate("")).toBeNull();
    expect(parseISODate("2024-13-45")).toBeNull();
  });

  it("should handle timezone offsets", () => {
    const date = parseISODate("2024-01-15T10:30:00+05:00");
    expect(date).toBeInstanceOf(Date);
  });
});

describe("isValidISODate", () => {
  it("should return true for valid dates", () => {
    expect(isValidISODate("2024-01-15T10:30:00.000Z")).toBe(true);
    expect(isValidISODate("2024-06-01")).toBe(true);
  });

  it("should return false for invalid dates", () => {
    expect(isValidISODate("not a date")).toBe(false);
    expect(isValidISODate("")).toBe(false);
  });
});

describe("toISOString", () => {
  it("should convert Date to ISO string", () => {
    const date = new Date("2024-01-15T10:30:00.000Z");
    expect(toISOString(date)).toBe("2024-01-15T10:30:00.000Z");
  });
});

describe("parseDateOrNull", () => {
  it("should return ISO string for valid dates", () => {
    const result = parseDateOrNull("2024-01-15T10:30:00.000Z");
    expect(result).toBe("2024-01-15T10:30:00.000Z");
  });

  it("should return null for undefined/null/empty", () => {
    expect(parseDateOrNull(undefined)).toBeNull();
    expect(parseDateOrNull(null)).toBeNull();
    expect(parseDateOrNull("")).toBeNull();
  });

  it("should return null for invalid dates", () => {
    expect(parseDateOrNull("not valid")).toBeNull();
  });
});

describe("validateDateArgs", () => {
  it("should pass for valid ISO dates", () => {
    expect(() =>
      validateDateArgs({ dueDate: "2024-01-15T10:30:00Z", deferDate: "2024-06-01" }, ["dueDate", "deferDate"]),
    ).not.toThrow();
  });

  it("should throw for invalid date strings", () => {
    expect(() =>
      validateDateArgs({ dueDate: "not-a-date" }, ["dueDate"]),
    ).toThrow("Invalid date for 'dueDate': not-a-date");
  });

  it("should skip undefined fields", () => {
    expect(() =>
      validateDateArgs({ dueDate: undefined }, ["dueDate"]),
    ).not.toThrow();
  });

  it("should skip null fields", () => {
    expect(() =>
      validateDateArgs({ dueDate: null }, ["dueDate"]),
    ).not.toThrow();
  });

  it("should skip missing fields", () => {
    expect(() =>
      validateDateArgs({}, ["dueDate", "deferDate"]),
    ).not.toThrow();
  });

  it("should skip non-string fields", () => {
    expect(() =>
      validateDateArgs({ dueDate: 12345 }, ["dueDate"]),
    ).not.toThrow();
  });

  it("should validate only specified fields", () => {
    expect(() =>
      validateDateArgs({ dueDate: "valid-date-no", otherField: "also-not-a-date" }, ["otherField"]),
    ).toThrow("Invalid date for 'otherField'");
  });
});

// vitest.config.ts pins TZ to America/Los_Angeles (PDT = UTC-7, PST = UTC-8).
describe("normalizeDateOnly", () => {
  it("runs in the pinned test time zone", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Los_Angeles");
  });

  it("puts a bare date on that local day instead of UTC midnight", () => {
    expect(normalizeDateOnly("2026-09-28", START_OF_DAY)).toBe("2026-09-28T07:00:00.000Z");
  });

  it("applies the time of day", () => {
    expect(normalizeDateOnly("2026-10-02", [17, 0])).toBe("2026-10-03T00:00:00.000Z");
    expect(normalizeDateOnly("2026-10-02", END_OF_DAY)).toBe("2026-10-03T06:59:59.999Z");
  });

  it("uses the offset in effect on that date across the DST switch (Sun Nov 1 2026)", () => {
    expect(normalizeDateOnly("2026-10-31", [17, 0])).toBe("2026-11-01T00:00:00.000Z");
    expect(normalizeDateOnly("2026-11-01", START_OF_DAY)).toBe("2026-11-01T07:00:00.000Z");
    expect(normalizeDateOnly("2026-11-01", [17, 0])).toBe("2026-11-02T01:00:00.000Z");
    expect(normalizeDateOnly("2026-11-01", END_OF_DAY)).toBe("2026-11-02T07:59:59.999Z");
  });

  it("passes date-times through unchanged", () => {
    for (const value of ["2026-09-28T00:00:00-07:00", "2026-09-28T17:00:00Z", "2026-09-28T17:00:00", "2026-09-28T17:00:00.000Z"]) {
      expect(normalizeDateOnly(value, START_OF_DAY)).toBe(value);
    }
  });

  it("returns null for impossible calendar dates that Date would roll over", () => {
    expect(normalizeDateOnly("2026-02-30", START_OF_DAY)).toBeNull();
    expect(normalizeDateOnly("2026-04-31", START_OF_DAY)).toBeNull();
    expect(normalizeDateOnly("2028-02-29", START_OF_DAY)).toBe("2028-02-29T08:00:00.000Z");
  });
});

describe("normalizeDateArgs", () => {
  it("applies OmniFocus's default defer, planned, and due times", () => {
    const result = normalizeDateArgs(
      { name: "x", deferDate: "2026-10-02", plannedDate: "2026-10-02", dueDate: "2026-10-02" },
      TASK_DATE_TIMES,
    );
    expect(result).toEqual({
      name: "x",
      deferDate: "2026-10-02T07:00:00.000Z",
      plannedDate: "2026-10-02T16:00:00.000Z",
      dueDate: "2026-10-03T00:00:00.000Z",
    });
  });

  it("makes filter bounds cover the whole local day", () => {
    const result = normalizeDateArgs({ dueAfter: "2026-10-02", dueBefore: "2026-10-02" }, FILTER_DATE_TIMES);
    expect(result).toEqual({ dueAfter: "2026-10-02T07:00:00.000Z", dueBefore: "2026-10-03T06:59:59.999Z" });
  });

  it("leaves null, undefined, empty, and unlisted fields alone and does not mutate its input", () => {
    const args = { id: "t", deferDate: null, dueDate: undefined, plannedDate: "", other: "2026-10-02" };
    const result = normalizeDateArgs(args, TASK_DATE_TIMES);
    expect(result).toEqual(args);
    expect(result).not.toBe(args);
  });

  it("throws for impossible calendar dates", () => {
    expect(() => normalizeDateArgs({ dueDate: "2026-02-30" }, TASK_DATE_TIMES)).toThrow("Invalid date for 'dueDate'");
  });
});
