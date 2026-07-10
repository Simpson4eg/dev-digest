/* ProjectContextView.test.tsx — component test for the Project Context screen.
   Covers: list rendering and empty-state (AC-3). Fetch is mocked via vi.mock. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import contextMessages from "../../../../../../../messages/en/context.json";

// Mock the data hook so the component renders without a network/query client.
const useContextDocs = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: (repoId: unknown) => useContextDocs(repoId),
}));

// Mock AppShell — it pulls in several shell providers we don't need here.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import { ProjectContextView } from "./ProjectContextView";

afterEach(() => {
  cleanup();
  useContextDocs.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("renders the list of discovered docs when docs are present", () => {
    useContextDocs.mockReturnValue({
      data: {
        docs: [
          { path: "specs/SPEC-01.md" },
          { path: "docs/architecture.md" },
          { path: "insights/2026-06-01.md" },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderWithIntl(<ProjectContextView repoId="repo1" />);

    expect(screen.getByText("specs/SPEC-01.md")).toBeInTheDocument();
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.getByText("insights/2026-06-01.md")).toBeInTheDocument();
    expect(screen.getByText("3 documents discovered")).toBeInTheDocument();
  });

  it("renders the empty state when no docs are found (AC-3)", () => {
    useContextDocs.mockReturnValue({
      data: { docs: [] },
      isLoading: false,
      isError: false,
    });

    renderWithIntl(<ProjectContextView repoId="repo1" />);

    expect(screen.getByText("No context documents found")).toBeInTheDocument();
    expect(
      screen.getByText(/add markdown files under a specs\//i),
    ).toBeInTheDocument();
    // No error surfaced — AC-3 requires empty list, not an error.
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  it("renders loading skeletons while fetching", () => {
    useContextDocs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = renderWithIntl(<ProjectContextView repoId="repo1" />);
    // Skeletons render; no doc paths or empty-state visible.
    expect(screen.queryByText("No context documents found")).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="app-shell"]')).toBeInTheDocument();
  });

  it("renders an error message on fetch failure", () => {
    useContextDocs.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderWithIntl(<ProjectContextView repoId="repo1" />);

    expect(
      screen.getByText("Could not load project context documents."),
    ).toBeInTheDocument();
  });
});
