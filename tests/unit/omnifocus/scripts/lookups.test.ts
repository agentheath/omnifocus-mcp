import { describe, it, expect, beforeEach } from "vitest";
import vm from "node:vm";
import { findProjectByNameFn, resolveTagsFn } from "../../../../src/omnifocus/lookups.js";
import { effectiveStatusFn } from "../../../../src/omnifocus/serializers.js";
import {
  buildCreateTaskScript,
  buildBatchCreateTasksScript,
  buildSetTaskTagsScript,
  buildMoveTasksScript,
} from "../../../../src/omnifocus/scripts/tasks.js";
import { buildCreateProjectScript } from "../../../../src/omnifocus/scripts/projects.js";

// Minimal OmniJS globals so the generated scripts run for real.
const Project = { Status: { Active: "Active", OnHold: "OnHold", Done: "Done", Dropped: "Dropped" } };
class Folder {
  static Status = { Active: "Active", Dropped: "Dropped" };
  parent = null;
  constructor(public status: string) {}
}

function makeProject(id: string, name: string, status: string, parentFolder: Folder | null = null) {
  return { id: { primaryKey: id }, name, status, parentFolder, ending: `end:${id}` };
}

function makeTag(name: string) {
  return { id: { primaryKey: `tag:${name}` }, name };
}

let created: { tasks: string[]; tags: string[]; projects: string[]; clearedTags: number; movedTo: string[] };

function makeGlobals(projects: ReturnType<typeof makeProject>[], tagNames: string[]) {
  const flattenedTags = tagNames.map(makeTag);
  class Tag {
    id: { primaryKey: string };
    constructor(public name: string) {
      this.id = { primaryKey: `tag:${name}` };
      created.tags.push(name);
    }
  }
  class Task {
    static Status = { Completed: "Completed", Dropped: "Dropped" };
    static RepetitionMethod = { Fixed: "Fixed" };
    constructor(name: string) {
      created.tasks.push(name);
      throw new Error("stop after creation: this test only checks what happens before it");
    }
  }
  class ProjectCtor {
    static Status = Project.Status;
    constructor(name: string) {
      created.projects.push(name);
      throw new Error("stop after creation");
    }
  }
  const task = {
    id: { primaryKey: "t1" },
    clearTags: () => created.clearedTags++,
    addTag: () => {},
    removeTag: () => {},
  };
  return {
    Project: ProjectCtor,
    Folder,
    Tag,
    Task,
    tags: [],
    flattenedTags,
    flattenedProjects: projects,
    flattenedTasks: [task],
    flattenedFolders: [],
    inbox: { ending: "end:inbox" },
    library: { ending: "end:library" },
    byId: (list: { id: { primaryKey: string } }[], id: string) => list.find((x) => x.id.primaryKey === id) ?? null,
    moveTasks: (_tasks: unknown[], destination: string) => {
      created.movedTo.push(destination);
    },
  };
}

beforeEach(() => {
  created = { tasks: [], tags: [], projects: [], clearedTags: 0, movedTo: [] };
});

function findProject(name: string, projects: ReturnType<typeof makeProject>[]): string {
  const script = `${effectiveStatusFn}\n${findProjectByNameFn}\nfindProjectByName(${JSON.stringify(name)}).id.primaryKey`;
  return vm.runInNewContext(script, makeGlobals(projects, [])) as string;
}

function resolve(names: string[], existing: string[], createMissing = false): string[] {
  const script = `${resolveTagsFn}\nObject.keys(resolveTags(${JSON.stringify(names)}, ${createMissing}))`;
  return vm.runInNewContext(script, makeGlobals([], existing)) as string[];
}

describe("findProjectByName", () => {
  it("returns the only project with that name, whatever its status", () => {
    expect(findProject("Ski Season", [makeProject("p1", "Ski Season", "Done")])).toBe("p1");
  });

  it("throws when no project has that name", () => {
    expect(() => findProject("Nope", [makeProject("p1", "Ski Season", "Active")])).toThrow("Project not found: Nope");
  });

  it("prefers the active or on-hold project over done and dropped ones", () => {
    const projects = [
      makeProject("old", "Ski Season", "Done"),
      makeProject("gone", "Ski Season", "Dropped"),
      makeProject("current", "Ski Season", "OnHold"),
    ];
    expect(findProject("Ski Season", projects)).toBe("current");
  });

  it("treats a project in a dropped folder as closed", () => {
    const projects = [
      makeProject("hidden", "Ski Season", "Active", new Folder("Dropped")),
      makeProject("current", "Ski Season", "Active"),
    ];
    expect(findProject("Ski Season", projects)).toBe("current");
  });

  it("throws with candidate IDs when several open projects share the name", () => {
    const projects = [makeProject("a", "Ski Season", "Active"), makeProject("b", "Ski Season", "OnHold"), makeProject("c", "Ski Season", "Done")];
    expect(() => findProject("Ski Season", projects)).toThrow(
      'Multiple projects are named "Ski Season" and still open. Use projectId instead: a (active), b (on hold)',
    );
  });

  it("throws with candidate IDs when every match is closed", () => {
    const projects = [makeProject("a", "Ski Season", "Done"), makeProject("b", "Ski Season", "Dropped")];
    expect(() => findProject("Ski Season", projects)).toThrow("Use projectId instead: a (done), b (dropped)");
  });
});

describe("resolveTags", () => {
  it("resolves existing tags by exact name", () => {
    expect(resolve(["writing", "calls"], ["writing", "calls"])).toEqual(["writing", "calls"]);
    expect(created.tags).toEqual([]);
  });

  it("rejects unknown names and suggests near-duplicates", () => {
    expect(() => resolve(["Interview prep", "brand-new"], ["Interview Prep", "interview-prep"])).toThrow(
      'Unknown tags: "Interview prep" (did you mean "Interview Prep" or "interview-prep"?), "brand-new". ' +
        "Use an existing tag name exactly, create it first with create_tag, or pass createMissingTags: true.",
    );
    expect(created.tags).toEqual([]);
  });

  it("creates each missing tag once when createMissing is true", () => {
    expect(resolve(["new", "writing", "new"], ["writing"], true)).toEqual(["writing", "new"]);
    expect(created.tags).toEqual(["new"]);
  });
});

describe("name resolution happens before any mutation", () => {
  const projects = [makeProject("p1", "Ski Season", "Active"), makeProject("p2", "Ski Season", "Active")];

  function run(script: string) {
    return () => vm.runInNewContext(script, makeGlobals(projects, ["writing"]));
  }

  it("create_task with an unknown tag creates neither the task nor the tag", () => {
    expect(run(buildCreateTaskScript({ name: "T", tags: ["Writing"] }))).toThrow('did you mean "writing"?');
    expect(created).toMatchObject({ tasks: [], tags: [] });
  });

  it("create_task with an ambiguous project name creates nothing", () => {
    expect(run(buildCreateTaskScript({ name: "T", projectName: "Ski Season" }))).toThrow("Multiple projects");
    expect(created.tasks).toEqual([]);
  });

  it("create_task with createMissingTags creates the tag and then the task", () => {
    expect(run(buildCreateTaskScript({ name: "T", tags: ["fresh"], createMissingTags: true }))).toThrow("stop after creation");
    expect(created).toMatchObject({ tags: ["fresh"], tasks: ["T"] });
  });

  it("batch_create_tasks checks tags at every depth before creating any task", () => {
    const script = buildBatchCreateTasksScript({
      tasks: [{ name: "parent", tags: ["writing"], children: [{ name: "child", children: [{ name: "grandchild", tags: ["typo"] }] }] }],
    });
    expect(run(script)).toThrow('Unknown tag: "typo"');
    expect(created.tasks).toEqual([]);
  });

  it("set_task_tags replace with an unknown tag leaves the existing tags alone", () => {
    expect(run(buildSetTaskTagsScript({ taskId: "t1", tagNames: ["typo"], mode: "replace" }))).toThrow("Unknown tag");
    expect(created.clearedTags).toBe(0);
  });

  it("set_task_tags remove ignores unknown names instead of failing", () => {
    const script = buildSetTaskTagsScript({ taskId: "t1", tagNames: ["typo"], mode: "remove" });
    // The script reaches serializeTask, which the minimal mock task can't satisfy; anything but an Unknown-tag error is fine.
    expect(run(script)).not.toThrow(/Unknown tag/);
  });

  it("move_tasks with an ambiguous project name moves nothing", () => {
    expect(run(buildMoveTasksScript({ taskIds: ["t1"], projectName: "Ski Season" }))).toThrow("Multiple projects");
    expect(created.movedTo).toEqual([]);
  });

  it("create_project with an unknown tag creates neither the project nor the tag", () => {
    expect(run(buildCreateProjectScript({ name: "P", tags: ["typo"] }))).toThrow("Unknown tag");
    expect(created).toMatchObject({ projects: [], tags: [] });
  });
});
