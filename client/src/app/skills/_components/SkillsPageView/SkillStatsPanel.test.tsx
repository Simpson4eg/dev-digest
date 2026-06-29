import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";

vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({
    data: {
      window_days: 30,
      used_by_agents: [{ id: "a1", name: "Security Reviewer", enabled: true }],
      runs_with_skill: 3,
      traced_runs: 4,
      pull_frequency: 0.75,
      findings: 5,
      accepted: 3,
      dismissed: 1,
      accept_rate: 0.75,
      findings_by_category: [{ category: "security", count: 5 }],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { SkillStatsPanel } from "./SkillStatsPanel";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "secret-gate",
  description: "Detect secrets.",
  type: "security",
  source: "manual",
  body: "# Secrets",
  enabled: true,
  version: 1,
  evidence_files: null,
};

describe("SkillStatsPanel", () => {
  it("renders usage, attribution and linked agents", () => {
    render(<SkillStatsPanel skill={SKILL} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText(/3 of 4 completed runs/)).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getAllByText("75").length).toBeGreaterThanOrEqual(2);
  });
});
