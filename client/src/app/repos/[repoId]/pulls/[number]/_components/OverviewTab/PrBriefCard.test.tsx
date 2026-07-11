/**
 * PrBriefCard — focused render assertions per Task 8 success check.
 *
 * (a) each risk_level shows its color token AND a text label (AC-16 + a11y)
 * (b) a focus item renders a link to file+line anchored to `ref` when present, else head
 * (c) `outdated` shows the badge (AC-14b/16b)
 * (d) `materialized:false` shows the empty state (AC-3b/16b)
 *
 * Drive by stubbing useBrief / useRegenerateBrief — layout only, no real fetch.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { BriefResponse } from "@devdigest/shared";

// Stub the hooks BEFORE importing the component (hoisting matters).
const useBrief = vi.fn();
const useRegenerateBrief = vi.fn();
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: (prId: unknown) => useBrief(prId),
  useRegenerateBrief: (prId: unknown) => useRegenerateBrief(prId),
}));

import { PrBriefCard } from "./PrBriefCard";

// Default no-op mutation returned by useRegenerateBrief in every test.
const NOOP_REGEN = { mutate: vi.fn(), isPending: false };

afterEach(() => {
  cleanup();
  useBrief.mockReset();
  useRegenerateBrief.mockReset();
});

const PROPS = { prId: "pr1", repoFullName: "acme/web", headSha: "head000" };

// ---- Fixtures ----

const BRIEF_LOW: BriefResponse = {
  what: "Adds rate limiting to public API.",
  why: "Prevent abuse by malicious clients.",
  risk_level: "low",
  risks: [],
  review_focus: [],
  materialized: true,
  outdated: false,
  ref: null,
  source: "fresh",
  input_tokens: 120,
  built_head_sha: "head000",
};

const BRIEF_MEDIUM: BriefResponse = {
  ...BRIEF_LOW,
  risk_level: "medium",
  risks: [
    {
      title: "Rate limit bypass",
      explanation: "A crafted request can bypass the limit.",
      severity: "medium",
      file_refs: ["src/mw.ts"],
    },
  ],
  review_focus: [
    { file: "src/mw.ts", line: 42, symbol: null, reason: "Core middleware change" },
  ],
};

const BRIEF_HIGH: BriefResponse = {
  ...BRIEF_LOW,
  risk_level: "high",
};

const BRIEF_WITH_REF: BriefResponse = {
  ...BRIEF_MEDIUM,
  ref: "idx0000",
};

const BRIEF_OUTDATED: BriefResponse = {
  ...BRIEF_MEDIUM,
  outdated: true,
};

const BRIEF_EMPTY: BriefResponse = {
  what: "",
  why: "",
  risk_level: "low",
  risks: [],
  review_focus: [],
  materialized: false,
  outdated: null,
  ref: null,
  source: null,
  input_tokens: null,
  built_head_sha: null,
};

// ---- (a) risk_level → color token AND text label ----

describe("risk_level color + text label (AC-16, a11y)", () => {
  it("low risk_level: renders 'Low risk' text label", () => {
    useBrief.mockReturnValue({ data: BRIEF_LOW, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    expect(screen.getByText("Low risk")).toBeInTheDocument();
  });

  it("medium risk_level: renders 'Medium risk' text label", () => {
    useBrief.mockReturnValue({ data: BRIEF_MEDIUM, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
  });

  it("high risk_level: renders 'High risk' text label", () => {
    useBrief.mockReturnValue({ data: BRIEF_HIGH, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    expect(screen.getByText("High risk")).toBeInTheDocument();
  });

  it("risk_level badge carries aria-label for screen readers", () => {
    useBrief.mockReturnValue({ data: BRIEF_HIGH, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    // The <span aria-label="High risk"> must exist.
    expect(screen.getByLabelText("High risk")).toBeInTheDocument();
  });
});

// ---- (b) focus item link anchored to ref when present, else head ----

describe("review_focus links (AC-16)", () => {
  it("anchors focus link to headSha when brief.ref is null", () => {
    useBrief.mockReturnValue({ data: BRIEF_MEDIUM, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);

    // BRIEF_MEDIUM has ref: null → should use headSha "head000"
    const link = screen.getByText("src/mw.ts:42").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/web/blob/head000/src/mw.ts#L42",
    );
  });

  it("anchors focus link to blast ref sha when brief.ref is set (AC-10)", () => {
    useBrief.mockReturnValue({ data: BRIEF_WITH_REF, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);

    // BRIEF_WITH_REF has ref: "idx0000" → must override headSha
    const link = screen.getByText("src/mw.ts:42").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/web/blob/idx0000/src/mw.ts#L42",
    );
  });

  it("renders focus item reason below the file link", () => {
    useBrief.mockReturnValue({ data: BRIEF_MEDIUM, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    expect(screen.getByText("Core middleware change")).toBeInTheDocument();
  });
});

// ---- (c) outdated badge (AC-14b / AC-16b) ----

describe("outdated state (AC-14b/16b)", () => {
  it("shows the outdated badge when brief.outdated is true", () => {
    useBrief.mockReturnValue({ data: BRIEF_OUTDATED, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    expect(screen.getByTestId("brief-outdated-badge")).toBeInTheDocument();
    expect(screen.getByText(/outdated/i)).toBeInTheDocument();
  });

  it("does NOT show the outdated badge when brief.outdated is false", () => {
    useBrief.mockReturnValue({ data: BRIEF_MEDIUM, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    expect(screen.queryByTestId("brief-outdated-badge")).not.toBeInTheDocument();
  });
});

// ---- (d) materialized:false → empty state (AC-3b / AC-16b) ----

describe("empty state when materialized is false (AC-3b/16b)", () => {
  it("renders the empty state, NOT a blank low-risk brief", () => {
    useBrief.mockReturnValue({ data: BRIEF_EMPTY, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);

    expect(screen.getByTestId("brief-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/not enough signal/i)).toBeInTheDocument();
    // Must NOT render the risk level badge or the brief content.
    expect(screen.queryByText("Low risk")).not.toBeInTheDocument();
    expect(screen.queryByText("High risk")).not.toBeInTheDocument();
  });
});

// ---- loading / null states ----

describe("loading + null states", () => {
  it("renders nothing while the first load is in flight", () => {
    useBrief.mockReturnValue({ data: undefined, isLoading: true });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    const { container } = render(<PrBriefCard {...PROPS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders section header and generate button when brief is null after load", () => {
    useBrief.mockReturnValue({ data: null, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);
    expect(screen.getByText("Why + Risk Brief")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
  });
});

// ---- risk card content ----

describe("risk card content", () => {
  it("renders risk title, explanation, severity label, and file ref", () => {
    useBrief.mockReturnValue({ data: BRIEF_MEDIUM, isLoading: false });
    useRegenerateBrief.mockReturnValue(NOOP_REGEN);
    render(<PrBriefCard {...PROPS} />);

    expect(screen.getByText("Rate limit bypass")).toBeInTheDocument();
    expect(screen.getByText("A crafted request can bypass the limit.")).toBeInTheDocument();
    // Severity text label (a11y: color + text)
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("src/mw.ts")).toBeInTheDocument();
  });
});
