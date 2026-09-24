import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { buildListTasksScript, buildGetTaskCountScript } from "../../../../src/omnifocus/scripts/tasks.js";
import { buildDatabaseSummaryScript } from "../../../../src/omnifocus/scripts/database.js";
import { serializeProjectFn } from "../../../../src/omnifocus/serializers.js";
import type { ListTasksArgs } from "../../../../src/types/omnifocus.js";

// Minimal OmniJS globals so the generated scripts run for real instead of being string-matched.
const Task = {
  Status: {
    Available: "Available",
    Blocked: "Blocked",
    Completed: "Completed",
    Dropped: "Dropped",
    Next: "Next",
    DueSoon: "DueSoon",
    Overdue: "Overdue",
  },
  RepetitionMethod: { Fixed: "Fixed", StartAfterCompletion: "StartAfterCompletion", DueAfterCompletion: "DueAfterCompletion" },
};
const Project = { Status: { Active: "Active", OnHold: "OnHold", Done: "Done", Dropped: "Dropped" } };
class Folder {
  static Status = { Active: "Active", Dropped: "Dropped" };
  id = { primaryKey: "folder" };
  parent = null;
  constructor(public status: string) {}
}

type Status = keyof typeof Task.Status;

function makeProject(name: string, status = "Active", parentFolder: Folder | null = null) {
  return {
    id: { primaryKey: name },
    name,
    status,
    parentFolder,
    task: { tags: [] },
    flattenedTasks: [] as ReturnType<typeof makeTask>[],
  };
}

function makeTask(name: string, status: Status, project: ReturnType<typeof makeProject> | null, extra: Record<string, unknown> = {}) {
  const task = {
    id: { primaryKey: name },
    name,
    note: "",
    taskStatus: Task.Status[status],
    effectivelyDropped: false,
    effectiveFlagged: false,
    containingProject: project,
    tags: [],
    ...extra,
  };
  project?.flattenedTasks.push(task);
  return task;
}

const active = makeProject("Active");
const done = makeProject("Done project", "Done");
const droppedProject = makeProject("Dropped project", "Dropped");
const inDroppedFolder = makeProject("Folder child", "Active", new Folder("Dropped"));

const inboxNext = makeTask("inbox next", "Next", null);
const inboxBlocked = makeTask("inbox blocked", "Blocked", null);
const tasks = [
  makeTask("available", "Available", active),
  makeTask("Buy ski pass", "Next", active),
  makeTask("due soon", "DueSoon", active, { effectiveFlagged: true }),
  makeTask("overdue", "Overdue", active, { effectiveFlagged: true }),
  makeTask("blocked", "Blocked", active, { effectiveFlagged: true }),
  makeTask("completed", "Completed", active, { effectiveFlagged: true }),
  // Leftovers in a Done project report Dropped without effectivelyDropped.
  makeTask("done leftover", "Dropped", done, { effectiveFlagged: true }),
  makeTask("in dropped project", "Available", droppedProject),
  makeTask("in dropped folder", "Next", inDroppedFolder),
  inboxNext,
  inboxBlocked,
];

const globals = {
  Task,
  Project,
  Folder,
  flattenedTasks: tasks,
  inbox: [inboxNext, inboxBlocked],
  flattenedProjects: [active, done, droppedProject, inDroppedFolder],
  flattenedTags: [],
  flattenedFolders: [],
};

function run<T>(script: string): T {
  return JSON.parse(vm.runInNewContext(script, { ...globals }) as string) as T;
}

function names(args: ListTasksArgs): string[] {
  return run<{ name: string }[]>(buildListTasksScript({ limit: 1000, ...args })).map((t) => t.name);
}

const ACTIONABLE = ["available", "Buy ski pass", "due soon", "overdue", "inbox next"];
const REMAINING = [...ACTIONABLE.slice(0, 4), "blocked", "inbox next", "inbox blocked"];

describe("status filters (executed against mock OmniJS)", () => {
  it("taskStatus 'available' keeps Available, Next, DueSoon, and Overdue", () => {
    expect(names({ taskStatus: "available" })).toEqual(ACTIONABLE);
  });

  it("available: true matches taskStatus 'available'", () => {
    expect(names({ available: true })).toEqual(ACTIONABLE);
  });

  it("taskStatus 'remaining' also keeps Blocked", () => {
    expect(names({ taskStatus: "remaining" })).toEqual(REMAINING);
  });

  it("completed: false matches taskStatus 'remaining'", () => {
    expect(names({ completed: false })).toEqual(REMAINING);
  });

  it("finds a Next task by search with taskStatus 'remaining'", () => {
    expect(names({ search: "ski pass", taskStatus: "remaining" })).toEqual(["Buy ski pass"]);
  });

  it("taskStatus 'dropped' includes Dropped-status leftovers and inherited drops", () => {
    expect(names({ taskStatus: "dropped" })).toEqual(["done leftover", "in dropped project", "in dropped folder"]);
  });

  it("taskStatus 'completed' keeps only Completed", () => {
    expect(names({ taskStatus: "completed" })).toEqual(["completed"]);
  });

  it("get_task_count agrees with list_tasks", () => {
    expect(run<{ count: number }>(buildGetTaskCountScript({ taskStatus: "available" })).count).toBe(ACTIONABLE.length);
    expect(run<{ count: number }>(buildGetTaskCountScript({ taskStatus: "remaining" })).count).toBe(REMAINING.length);
  });

  it("flagged + available surfaces flagged DueSoon and Overdue tasks", () => {
    expect(names({ flagged: true, taskStatus: "available" })).toEqual(["due soon", "overdue"]);
  });

  it("project remainingTaskCount counts every remaining status", () => {
    const serialize = (p: ReturnType<typeof makeProject>) =>
      vm.runInNewContext(`${serializeProjectFn}\nserializeProject(p).remainingTaskCount`, { ...globals, p }) as number;
    expect(serialize(active)).toBe(5);
    expect(serialize(done)).toBe(0);
  });

  it("database summary counts actionable inbox and available tasks", () => {
    const summary = run<Record<string, number>>(buildDatabaseSummaryScript());
    expect(summary.inboxCount).toBe(1);
    expect(summary.availableTaskCount).toBe(ACTIONABLE.length);
    expect(summary.dueSoonTaskCount).toBe(1);
    expect(summary.overdueTaskCount).toBe(1);
    expect(summary.flaggedTaskCount).toBe(3);
  });
});
