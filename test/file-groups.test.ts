import { describe, expect, it } from "vitest";
import { changeBadge, fileKind, fileName, folderOf, groupByFolder } from "../shared/file-groups";

describe("file names and folders", () => {
  it("splits paths", () => {
    expect(fileName("src/auth/token.ts")).toBe("token.ts");
    expect(folderOf("src/auth/token.ts")).toBe("src/auth");
    expect(folderOf("README.md")).toBe("");
  });
});

describe("fileKind", () => {
  it("recognizes common types and config files", () => {
    expect(fileKind("src/a.tsx")).toBe("code");
    expect(fileKind("package.json")).toBe("data");
    expect(fileKind("docs/README.md")).toBe("text");
    expect(fileKind("public/logo.PNG")).toBe("image");
    expect(fileKind(".env.local")).toBe("config");
    expect(fileKind("Dockerfile")).toBe("config");
    expect(fileKind("scripts/run.sh")).toBe("script");
    expect(fileKind("LICENSE")).toBe("other");
    expect(fileKind(".hidden")).toBe("other");
  });
});

describe("changeBadge", () => {
  it("maps plain change words to card badges", () => {
    expect(changeBadge("new")).toBe("NEW");
    expect(changeBadge("added")).toBe("NEW");
    expect(changeBadge("modified")).toBe("EDITED");
    expect(changeBadge("type changed")).toBe("TYPE CHANGED");
    expect(changeBadge("conflict")).toBe("CONFLICT");
    expect(changeBadge("something else")).toBe("EDITED");
  });
});

describe("groupByFolder", () => {
  it("puts the root first, sorts folders, and keeps order inside each folder", () => {
    const groups = groupByFolder(["src/b.ts", "README.md", "docs/x.md", "src/a.ts"], (path) => path);
    expect(groups).toEqual([
      { folder: "", items: ["README.md"] },
      { folder: "docs", items: ["docs/x.md"] },
      { folder: "src", items: ["src/b.ts", "src/a.ts"] },
    ]);
  });
});
