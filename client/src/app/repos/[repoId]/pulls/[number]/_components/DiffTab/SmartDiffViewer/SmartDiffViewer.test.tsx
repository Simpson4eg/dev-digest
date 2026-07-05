import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

function renderViewer(smartDiff: SmartDiff, files: PrFile[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      <SmartDiffViewer smartDiff={smartDiff} files={files} />
    </NextIntlClientProvider>,
  );
}

const CORE_PATCH = "@@ -0,0 +1,3 @@\n+const a = 1;\n+const b = 2;\n+const c = 3;";

const FILES: PrFile[] = [
  { path: "src/middleware/ratelimit.ts", additions: 3, deletions: 0, patch: CORE_PATCH },
  { path: "pnpm-lock.yaml", additions: 92, deletions: 24, patch: "@@ -1 +1 @@\n-old\n+new" },
];

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        {
          path: "src/middleware/ratelimit.ts",
          pseudocode_summary: "New token-bucket limiter",
          additions: 3,
          deletions: 0,
          finding_lines: [2],
        },
      ],
    },
    {
      role: "boilerplate",
      files: [
        { path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 92, deletions: 24, finding_lines: [] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 119, proposed_splits: [] },
};

afterEach(cleanup);

describe("SmartDiffViewer", () => {
  it("renders role groups with their labels", () => {
    renderViewer(SMART_DIFF, FILES);
    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();
  });

  it("collapses the boilerplate group by default (lock-file hidden until expanded)", () => {
    renderViewer(SMART_DIFF, FILES);
    // Core file is visible; the lock-file is not, because Boilerplate starts collapsed.
    expect(screen.getByText("src/middleware/ratelimit.ts")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("shows a finding badge on flagged files and the reused summary line", () => {
    renderViewer(SMART_DIFF, FILES);
    expect(screen.getByRole("button", { name: /1 finding/i })).toBeInTheDocument();
    expect(screen.getByText("What this does:")).toBeInTheDocument();
    expect(screen.getByText(/New token-bucket limiter/)).toBeInTheDocument();
  });

  it("auto-expands a flagged file and anchors the flagged line for scroll-to", () => {
    const { container } = renderViewer(SMART_DIFF, FILES);
    // The flagged line (new-file line 2) is rendered with its scroll anchor id.
    expect(container.querySelector("#sd-src\\/middleware\\/ratelimit\\.ts-L2")).not.toBeNull();
    // Clicking the badge is safe (scrollIntoView is guarded in jsdom).
    fireEvent.click(screen.getByRole("button", { name: /1 finding/i }));
    expect(screen.getByText("const b = 2;")).toBeInTheDocument();
  });

  it("renders a split-suggestion banner only when the PR is too big", () => {
    const { rerender } = renderViewer(SMART_DIFF, FILES);
    expect(screen.queryByText(/large enough to be hard to review/i)).not.toBeInTheDocument();

    const big: SmartDiff = {
      ...SMART_DIFF,
      split_suggestion: {
        too_big: true,
        total_lines: 900,
        proposed_splits: [
          { name: "src/api", files: ["src/api/a.ts"] },
          { name: "src/db", files: ["src/db/b.ts"] },
        ],
      },
    };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
        <SmartDiffViewer smartDiff={big} files={FILES} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/large enough to be hard to review/i)).toBeInTheDocument();
    const banner = screen.getByText(/large enough to be hard to review/i).closest("div")!;
    expect(within(banner).getByText(/src\/api, src\/db/)).toBeInTheDocument();
  });
});
