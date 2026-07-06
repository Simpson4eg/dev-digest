import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/shell.json";

// Drive the tab by stubbing the data hooks; render the real diff subtree.
const usePrComments = vi.fn();
const useCreatePrComment = vi.fn();
const useSmartDiff = vi.fn();
const usePrReviews = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: (id: unknown) => usePrComments(id),
  useCreatePrComment: (id: unknown) => useCreatePrComment(id),
  useSmartDiff: (id: unknown) => useSmartDiff(id),
  usePrReviews: (id: unknown) => usePrReviews(id),
}));

import { DiffTab } from "./DiffTab";

const PATCH = "@@ -0,0 +1,6 @@\n+l1\n+l2\n+l3\n+l4\n+l5\n+l6";
const FILES: PrFile[] = [{ path: "src/a.ts", additions: 6, deletions: 0, patch: PATCH }];
const SMART: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/a.ts", pseudocode_summary: null, additions: 6, deletions: 0, finding_lines: [2, 5] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

// The finding overlay now comes from the latest review, not smart-diff.
const REVIEWS = [
  {
    id: "rv1",
    kind: "review",
    findings: [
      { id: "f1", severity: "CRITICAL", category: "bug", title: "A", rationale: "ra", suggestion: null, file: "src/a.ts", start_line: 2, end_line: 2, confidence: 0.9 },
      { id: "f2", severity: "WARNING", category: "perf", title: "B", rationale: "rb", suggestion: null, file: "src/a.ts", start_line: 5, end_line: 5, confidence: 0.8 },
    ],
  },
];

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <DiffTab prId="pr1" filesCount={1} files={FILES} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  usePrComments.mockReturnValue({ data: [] });
  useCreatePrComment.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  useSmartDiff.mockReturnValue({ data: SMART });
  usePrReviews.mockReturnValue({ data: REVIEWS });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DiffTab finding navigator", () => {
  it("shows the finding counter with the total and no position yet", () => {
    renderTab();
    expect(screen.getByText(/–\s*\/\s*2 findings/)).toBeInTheDocument();
  });

  it("Next / Prev buttons move the cursor with wrap-around", () => {
    renderTab();
    const next = screen.getByRole("button", { name: "Next finding (j)" });
    const prev = screen.getByRole("button", { name: "Previous finding (k)" });

    fireEvent.click(next);
    expect(screen.getByText(/1\s*\/\s*2 findings/)).toBeInTheDocument();
    fireEvent.click(next);
    expect(screen.getByText(/2\s*\/\s*2 findings/)).toBeInTheDocument();
    fireEvent.click(next); // wrap 2 → 1
    expect(screen.getByText(/1\s*\/\s*2 findings/)).toBeInTheDocument();
    fireEvent.click(prev); // wrap 1 → 2
    expect(screen.getByText(/2\s*\/\s*2 findings/)).toBeInTheDocument();
  });

  it("j / k hotkeys advance and retreat the cursor", () => {
    renderTab();
    fireEvent.keyDown(window, { key: "j" });
    expect(screen.getByText(/1\s*\/\s*2 findings/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k" }); // 1 → wrap back to 2
    expect(screen.getByText(/2\s*\/\s*2 findings/)).toBeInTheDocument();
  });

  it("ignores j / k while typing in an input", () => {
    renderTab();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "j" });
    expect(screen.getByText(/–\s*\/\s*2 findings/)).toBeInTheDocument();
    input.remove();
  });

  it("keeps the navigator available in Original order", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    // switching order resets the position but keeps the same finding count
    expect(screen.getByText(/–\s*\/\s*2 findings/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next finding (j)" }));
    expect(screen.getByText(/1\s*\/\s*2 findings/)).toBeInTheDocument();
  });
});
