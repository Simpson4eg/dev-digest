import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PrIntentRecord } from "@devdigest/shared";

// The panel is layout-only; drive it by stubbing the data hooks.
const useIntent = vi.fn();
const useRegenerateIntent = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useIntent: (prId: unknown) => useIntent(prId),
  useRegenerateIntent: (prId: unknown) => useRegenerateIntent(prId),
}));

import { IntentPanel } from "./IntentPanel";

const NOOP_REGENERATE = { mutate: vi.fn(), isPending: false };

afterEach(() => {
  cleanup();
  useIntent.mockReset();
  useRegenerateIntent.mockReset();
});

const INTENT: PrIntentRecord = {
  pr_id: "pr1",
  intent: "Add rate limiting to public API endpoints to prevent abuse.",
  in_scope: ["Add middleware for rate limiting", "Apply to /api/public/* routes"],
  out_of_scope: ["Authentication changes"],
};

describe("IntentPanel", () => {
  it("renders the motivation + IN/OUT scope lists when intent is present", () => {
    useIntent.mockReturnValue({ data: INTENT, isLoading: false });
    useRegenerateIntent.mockReturnValue(NOOP_REGENERATE);
    render(<IntentPanel prId="pr1" />);

    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText(/prevent abuse/)).toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Add middleware for rate limiting")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();
  });

  it("shows the empty state when no intent has been derived yet", () => {
    useIntent.mockReturnValue({ data: null, isLoading: false });
    useRegenerateIntent.mockReturnValue(NOOP_REGENERATE);
    render(<IntentPanel prId="pr1" />);

    expect(screen.getByText(/run a review/i)).toBeInTheDocument();
    expect(screen.queryByText("In scope")).not.toBeInTheDocument();
  });

  it("renders nothing while the first load is in flight", () => {
    useIntent.mockReturnValue({ data: undefined, isLoading: true });
    useRegenerateIntent.mockReturnValue(NOOP_REGENERATE);
    const { container } = render(<IntentPanel prId="pr1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a Recompute button that is enabled when intent exists", () => {
    useIntent.mockReturnValue({ data: INTENT, isLoading: false });
    useRegenerateIntent.mockReturnValue(NOOP_REGENERATE);
    render(<IntentPanel prId="pr1" />);
    const btn = screen.getByRole("button", { name: /recompute/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });
});
