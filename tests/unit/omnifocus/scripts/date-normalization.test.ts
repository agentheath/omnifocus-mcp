import { describe, it, expect } from "vitest";
import {
  buildListTasksScript,
  buildGetTaskCountScript,
  buildCreateTaskScript,
  buildUpdateTaskScript,
  buildBatchCreateTasksScript,
  buildCompleteTaskScript,
  buildAddTaskNotificationScript,
} from "../../../../src/omnifocus/scripts/tasks.js";
import { buildCreateProjectScript, buildUpdateProjectScript } from "../../../../src/omnifocus/scripts/projects.js";

// vitest.config.ts pins TZ to America/Los_Angeles, so 2026-10-02 is PDT (UTC-7).
const DEFER = "2026-10-02T07:00:00.000Z";
const PLANNED = "2026-10-02T16:00:00.000Z";
const DUE = "2026-10-03T00:00:00.000Z";
const DAY_END = "2026-10-03T06:59:59.999Z";
const BARE = "2026-10-02";

/** Recovers the args object embedded as JSON.parse("...") in a generated script. */
function embeddedArgs(script: string): Record<string, unknown> {
  const match = /var args = JSON\.parse\((".*?(?<!\\)")\);/.exec(script);
  if (!match) throw new Error("no embedded args");
  return JSON.parse(JSON.parse(match[1])) as Record<string, unknown>;
}

const dates = { deferDate: BARE, plannedDate: BARE, dueDate: BARE };
const expected = { deferDate: DEFER, plannedDate: PLANNED, dueDate: DUE };

describe("date-only normalization in script builders", () => {
  it("create_task converts bare dates to OmniFocus default local times", () => {
    expect(embeddedArgs(buildCreateTaskScript({ name: "T", ...dates }))).toMatchObject(expected);
  });

  it("update_task converts bare dates and keeps null (clear)", () => {
    const args = embeddedArgs(buildUpdateTaskScript({ id: "t", dueDate: BARE, deferDate: null }));
    expect(args).toMatchObject({ dueDate: DUE, deferDate: null });
  });

  it("create_project and update_project convert bare dates", () => {
    expect(embeddedArgs(buildCreateProjectScript({ name: "P", ...dates }))).toMatchObject(expected);
    expect(embeddedArgs(buildUpdateProjectScript({ id: "p", ...dates }))).toMatchObject(expected);
  });

  it("batch_create_tasks converts bare dates at every depth", () => {
    const args = embeddedArgs(
      buildBatchCreateTasksScript({
        tasks: [{ name: "parent", dueDate: BARE, children: [{ name: "child", deferDate: BARE, children: [{ name: "grandchild", plannedDate: BARE }] }] }],
      }),
    ) as { tasks: { dueDate: string; children: { deferDate: string; children: { plannedDate: string }[] }[] }[] };
    expect(args.tasks[0].dueDate).toBe(DUE);
    expect(args.tasks[0].children[0].deferDate).toBe(DEFER);
    expect(args.tasks[0].children[0].children[0].plannedDate).toBe(PLANNED);
  });

  it("list_tasks and get_task_count make bare filter bounds cover the whole local day", () => {
    const filters = { dueAfter: BARE, dueBefore: BARE, deferAfter: BARE, deferBefore: BARE, plannedAfter: BARE, plannedBefore: BARE };
    const want = { dueAfter: DEFER, dueBefore: DAY_END, deferAfter: DEFER, deferBefore: DAY_END, plannedAfter: DEFER, plannedBefore: DAY_END };
    expect(embeddedArgs(buildListTasksScript(filters))).toMatchObject(want);
    expect(embeddedArgs(buildGetTaskCountScript(filters))).toMatchObject(want);
  });

  it("list_tasks rejects invalid filter dates", () => {
    expect(() => buildListTasksScript({ dueBefore: "next week" })).toThrow("Invalid date for 'dueBefore'");
  });

  it("complete_task converts and validates completionDate", () => {
    expect(embeddedArgs(buildCompleteTaskScript("t", BARE))).toMatchObject({ completionDate: DEFER });
    expect(embeddedArgs(buildCompleteTaskScript("t"))).toMatchObject({ completionDate: null });
    expect(() => buildCompleteTaskScript("t", "last tuesday")).toThrow("Invalid date for 'completionDate'");
  });

  it("add_task_notification converts a bare absoluteDate to 9:00 AM", () => {
    const args = embeddedArgs(buildAddTaskNotificationScript({ taskId: "t", type: "absolute", absoluteDate: BARE }));
    expect(args).toMatchObject({ absoluteDate: PLANNED });
  });

  it("passes date-times with an offset through unchanged", () => {
    const due = "2026-10-02T12:30:00-07:00";
    expect(embeddedArgs(buildCreateTaskScript({ name: "T", dueDate: due }))).toMatchObject({ dueDate: due });
  });
});
