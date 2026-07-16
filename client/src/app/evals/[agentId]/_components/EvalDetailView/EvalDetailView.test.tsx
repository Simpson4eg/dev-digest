/* EvalDetailView.test.tsx — RTL unit tests for the per-agent Eval Detail page.

   Acceptance checks (SPEC-03 AC-15/16 + mentor review: /evals/[agentId] detail
   page with a Compare-two-runs modal):
   (a) Renders the agent name, current metrics, and a run-history row per group
   (b) "Compare runs" is enabled with ≥2 runs and opens the comparison modal
   (c) "Compare runs" is disabled with <2 runs

   All hooks + the dynamic route param are mocked — no QueryClient/router/server. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalDashboard, EvalRunGroup } from "@devdigest/shared";

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE importing the component (vi.mock hoisting)
// ---------------------------------------------------------------------------

const useRunHistoryMock = vi.fn();
const useEvalRunGroupsMock = vi.fn();
const useCompareRunsMock = vi.fn();
const usePromoteVersionMock = vi.fn();

vi.mock("@/lib/hooks/evals", () => ({
  useRunHistory: (id: unknown) => useRunHistoryMock(id),
  useEvalRunGroups: (id: unknown) => useEvalRunGroupsMock(id),
  useCompareRuns: (agentId: unknown, a: unknown, b: unknown) =>
    useCompareRunsMock(agentId, a, b),
  usePromoteVersion: () => usePromoteVersionMock(),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "agent-1", name: "Security Reviewer" }] }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ agentId: "agent-1" }) }));

import { EvalDetailView } from "./EvalDetailView";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "agent-1",
  cases_total: 9,
  current: {
    recall: 0.66,
    precision: 1,
    citation_accuracy: 1,
    traces_passed: 5,
    traces_total: 9,
    cost_usd: 0.009,
  },
  delta: { recall: 0.1, precision: 0, citation_accuracy: 0 },
  trend: [],
  recent_runs: [],
  alert: null,
};

const GROUP_B: EvalRunGroup = {
  id: "grp-2",
  workspace_id: "ws",
  owner_kind: "agent",
  owner_id: "agent-1",
  agent_version: 8,
  label: "candidate",
  ran_at: "2026-07-16T10:00:00Z",
  recall: 0.66,
  precision: 1,
  citation_accuracy: 1,
  total_cost_usd: 0.009,
};

const GROUP_A: EvalRunGroup = {
  ...GROUP_B,
  id: "grp-1",
  agent_version: 7,
  label: "baseline",
  ran_at: "2026-07-15T10:00:00Z",
  recall: 0.5,
  total_cost_usd: 0.008,
};

function primeHooks(runGroups: EvalRunGroup[]) {
  useRunHistoryMock.mockReturnValue({
    data: DASHBOARD,
    isLoading: false,
    isError: false,
  });
  useEvalRunGroupsMock.mockReturnValue({ data: runGroups });
  useCompareRunsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  usePromoteVersionMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EvalDetailView", () => {
  it("(a) renders the agent name, current metrics, and a run-history row per group", () => {
    primeHooks([GROUP_B, GROUP_A]);
    render(<EvalDetailView />);

    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    // Current recall = 66% (also appears in the group-B run row, hence getAllByText).
    expect(screen.getAllByText("66%").length).toBeGreaterThan(0);
    // One run-history row per group → versions v8 and v7 present.
    expect(screen.getByText("v8")).toBeInTheDocument();
    expect(screen.getByText("v7")).toBeInTheDocument();
    expect(screen.getByText("candidate")).toBeInTheDocument();
    expect(screen.getByText("baseline")).toBeInTheDocument();
  });

  it("(b) enables Compare with ≥2 runs and opens the comparison modal", () => {
    primeHooks([GROUP_B, GROUP_A]);
    render(<EvalDetailView />);

    const compareBtn = screen.getByRole("button", { name: /compare runs/i });
    expect(compareBtn).toBeEnabled();

    fireEvent.click(compareBtn);
    // The shared CompareModal renders with a title scoped to the agent + run selectors.
    expect(screen.getByText("Compare runs — Security Reviewer")).toBeInTheDocument();
    expect(screen.getByLabelText("Select baseline run group A")).toBeInTheDocument();
    expect(screen.getByLabelText("Select candidate run group B")).toBeInTheDocument();
  });

  it("(c) disables Compare when fewer than two runs exist", () => {
    primeHooks([GROUP_B]);
    render(<EvalDetailView />);

    expect(screen.getByRole("button", { name: /compare runs/i })).toBeDisabled();
  });
});
