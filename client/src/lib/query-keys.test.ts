import { describe, it, expect } from "vitest";
import { qk } from "./query-keys";

describe("qk — query-key factory", () => {
  it("builds stable param-less keys", () => {
    expect(qk.settings()).toEqual(["settings"]);
    expect(qk.repos()).toEqual(["repos"]);
    expect(qk.agents()).toEqual(["agents"]);
    expect(qk.skills()).toEqual(["skills"]);
  });

  it("builds parameterized keys including the param in the key", () => {
    expect(qk.pulls("r1")).toEqual(["pulls", "r1"]);
    expect(qk.pull("p1")).toEqual(["pull", "p1"]);
    expect(qk.reviews("p1")).toEqual(["reviews", "p1"]);
    expect(qk.prIntent("p1")).toEqual(["pr-intent", "p1"]);
    expect(qk.prActiveRuns("p1")).toEqual(["pr-active-runs", "p1"]);
    expect(qk.prRuns("p1")).toEqual(["pr-runs", "p1"]);
    expect(qk.runTrace("run1")).toEqual(["run-trace", "run1"]);
    expect(qk.repoIntelState("r1")).toEqual(["repo-intel-state", "r1"]);
    expect(qk.skillVersions("s1")).toEqual(["skill-versions", "s1"]);
  });

  it("distinct prId values yield distinct keys (guards against cache collisions)", () => {
    expect(qk.reviews("a")).not.toEqual(qk.reviews("b"));
  });

  it("provider-models: the all-key is a prefix of the per-provider key", () => {
    // TanStack invalidates by prefix, so invalidating qk.providerModels()
    // must match every qk.providerModelsFor(provider) entry.
    const all = qk.providerModels();
    const one = qk.providerModelsFor("openai");
    expect(one.slice(0, all.length)).toEqual(all);
  });

  it("agent-skills: the all-key is a prefix of an agent key", () => {
    const all = qk.allAgentSkills();
    const one = qk.agentSkills("a1");
    expect(one.slice(0, all.length)).toEqual(all);
  });

  it("skill-stats: the all-key is a prefix of a skill key", () => {
    const all = qk.allSkillStats();
    const one = qk.skillStats("s1");
    expect(one.slice(0, all.length)).toEqual(all);
  });
});
