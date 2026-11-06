import { describe, expect, it } from "bun:test";
import { ForgeContextResolver } from "../src/detector.ts";

describe("ForgeContextResolver", () => {
  it("should classify known forge hosts correctly", () => {
    expect(ForgeContextResolver.classifyHost("github.com")).toBe("github");
    expect(ForgeContextResolver.classifyHost("git.qtrn.io")).toBe("forgejo");
    expect(ForgeContextResolver.classifyHost("codeberg.org")).toBe("forgejo");
    expect(ForgeContextResolver.classifyHost("gitlab.com")).toBe("gitlab");
    expect(ForgeContextResolver.classifyHost("bitbucket.org")).toBe("bitbucket");
    expect(ForgeContextResolver.classifyHost("unknown-host.internal")).toBe("unknown");
  });

  it("should parse standard HTTPS git URLs", () => {
    const res = ForgeContextResolver.parseGitUrl("https://github.com/acme/widget.git");
    expect(res.host).toBe("github.com");
    expect(res.owner).toBe("acme");
    expect(res.repo).toBe("widget");
  });

  it("should parse SCP-style SSH git URLs", () => {
    const res = ForgeContextResolver.parseGitUrl("git@git.qtrn.io:tycho/tycho-forge.git");
    expect(res.host).toBe("git.qtrn.io");
    expect(res.owner).toBe("tycho");
    expect(res.repo).toBe("tycho-forge");
  });

  it("should handle nested GitLab group paths", () => {
    const res = ForgeContextResolver.parseGitUrl("https://gitlab.com/group/subgroup/project.git");
    expect(res.host).toBe("gitlab.com");
    expect(res.owner).toBe("group/subgroup");
    expect(res.repo).toBe("project");
  });
});
