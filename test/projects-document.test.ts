import { describe, expect, it } from "vitest";
import { withChanges } from "../shared/projects-document";

const project = { id: "p", name: "transcriber-api", path: "/mnt/c/transcriber-api" };
const folder = { id: "f", name: "work", path: "/home/me/work" };

describe("withChanges", () => {
  it("keeps folders when projects change", () => {
    expect(withChanges({ projects: [project], folders: [folder] }, { projects: [] })).toEqual({
      projects: [],
      folders: [folder],
    });
  });

  it("keeps projects when folders change", () => {
    expect(withChanges({ projects: [project], folders: [folder] }, { folders: [] })).toEqual({
      projects: [project],
      folders: [],
    });
  });

  it("copies the lists rather than sharing them", () => {
    const current = { projects: [project], folders: [folder] };
    const next = withChanges(current, {});
    expect(next).toEqual(current);
    expect(next.projects).not.toBe(current.projects);
  });
});
