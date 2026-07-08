import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { BlastRadius } from "@devdigest/shared";

// Layout-only panel — drive it by stubbing the data hook.
const useBlastRadius = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useBlastRadius: (prId: unknown) => useBlastRadius(prId),
}));

import { BlastRadiusPanel } from "./BlastRadiusPanel";

afterEach(() => {
  cleanup();
  useBlastRadius.mockReset();
});

const BLAST: BlastRadius = {
  changed_symbols: [{ name: "rateLimit", file: "src/mw.ts", kind: "function" }],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "handler", file: "src/api/public/index.ts", line: 23 },
        { name: "hook", file: "src/api/public/webhooks.ts", line: 45 },
      ],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["reset-rate-buckets"],
    },
  ],
  summary: "",
};

const PROPS = { prId: "pr1", repoFullName: "acme/web", headSha: "abc123" };

describe("BlastRadiusPanel", () => {
  it("renders the changed symbol, its callers, and impacted endpoints/crons", () => {
    useBlastRadius.mockReturnValue({ data: BLAST, isLoading: false });
    render(<BlastRadiusPanel {...PROPS} />);

    expect(screen.getByText("Blast Radius")).toBeInTheDocument();
    expect(screen.getByText("rateLimit")).toBeInTheDocument();
    // First symbol is expanded by default — callers rendered as file:line.
    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets")).toBeInTheDocument();
  });

  it("links each caller to the GitHub blob at its line", () => {
    useBlastRadius.mockReturnValue({ data: BLAST, isLoading: false });
    render(<BlastRadiusPanel {...PROPS} />);

    const link = screen.getByText("src/api/public/index.ts:23").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/web/blob/abc123/src/api/public/index.ts#L23",
    );
  });

  it("anchors caller links to blast.ref (indexed commit), not the PR head", () => {
    useBlastRadius.mockReturnValue({ data: { ...BLAST, ref: "idx0000" }, isLoading: false });
    render(<BlastRadiusPanel {...PROPS} />);

    const link = screen.getByText("src/api/public/index.ts:23").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/web/blob/idx0000/src/api/public/index.ts#L23",
    );
  });

  it("collapses the caller tree when the symbol row is clicked", () => {
    useBlastRadius.mockReturnValue({ data: BLAST, isLoading: false });
    render(<BlastRadiusPanel {...PROPS} />);

    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    fireEvent.click(screen.getByText("rateLimit"));
    expect(screen.queryByText("src/api/public/index.ts:23")).not.toBeInTheDocument();
  });

  it("shows a degraded badge when the index is incomplete", () => {
    useBlastRadius.mockReturnValue({
      data: { ...BLAST, degraded: true, reason: "index_partial" },
      isLoading: false,
    });
    render(<BlastRadiusPanel {...PROPS} />);
    expect(screen.getByText(/still building/i)).toBeInTheDocument();
  });

  it("shows the empty state when there is no downstream impact", () => {
    useBlastRadius.mockReturnValue({
      data: { changed_symbols: [], downstream: [], summary: "" },
      isLoading: false,
    });
    render(<BlastRadiusPanel {...PROPS} />);
    expect(screen.getByText(/No downstream impact/i)).toBeInTheDocument();
  });

  it("renders nothing while the first load is in flight", () => {
    useBlastRadius.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<BlastRadiusPanel {...PROPS} />);
    expect(container).toBeEmptyDOMElement();
  });
});
