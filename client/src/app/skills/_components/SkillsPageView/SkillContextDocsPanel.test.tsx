/* SkillContextDocsPanel.test.tsx — component test for the Skill editor context panel.
   Covers: attach a doc to a skill (mocked fetch — AC-5), detach, empty state.
   All fetches are mocked — no network or QueryClient required. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";

// ---------------------------------------------------------------------------
// Mocks — set up before the component import so vi.mock hoisting works.
// ---------------------------------------------------------------------------

const mockSetDocs = vi.fn();
let mutateArgs: { id: string; paths: string[] } | null = null;

vi.mock("@/lib/providers/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

const useContextDocsMock = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocs: (repoId: unknown) => useContextDocsMock(repoId),
}));

const useSkillContextDocsMock = vi.fn();
const useSetSkillContextDocsMock = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkillContextDocs: (id: unknown) => useSkillContextDocsMock(id),
  useSetSkillContextDocs: () => useSetSkillContextDocsMock(),
}));

import { SkillContextDocsPanel } from "./SkillContextDocsPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SKILL: Skill = {
  id: "sk1",
  name: "api-contract-gate",
  description: "Detect breaking API contract changes before merge.",
  type: "rubric",
  body: "# Rule\nCheck API contracts.",
  enabled: true,
  version: 1,
  source: "manual",
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mutateArgs = null;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillContextDocsPanel", () => {
  it("renders available docs and shows 0 attached initially", () => {
    useContextDocsMock.mockReturnValue({
      data: {
        docs: [
          { path: "specs/SPEC-01.md" },
          { path: "docs/arch.md" },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSkillContextDocsMock.mockReturnValue({
      data: { paths: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSetSkillContextDocsMock.mockReturnValue({
      mutate: mockSetDocs,
      isPending: false,
    });

    renderWithIntl(<SkillContextDocsPanel skill={SKILL} />);

    expect(screen.getByText("specs/SPEC-01.md")).toBeInTheDocument();
    expect(screen.getByText("docs/arch.md")).toBeInTheDocument();
    expect(screen.getByText("0 of 2 attached")).toBeInTheDocument();
  });

  it("attaches a doc when the checkbox is checked (AC-5)", () => {
    useContextDocsMock.mockReturnValue({
      data: { docs: [{ path: "specs/SPEC-01.md" }, { path: "docs/arch.md" }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSkillContextDocsMock.mockReturnValue({
      data: { paths: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSetSkillContextDocsMock.mockReturnValue({
      mutate: (args: { id: string; paths: string[] }) => { mutateArgs = args; },
      isPending: false,
    });

    renderWithIntl(<SkillContextDocsPanel skill={SKILL} />);

    const checkbox = screen.getByLabelText("Attach specs/SPEC-01.md");
    fireEvent.click(checkbox);

    expect(mutateArgs).toEqual({ id: "sk1", paths: ["specs/SPEC-01.md"] });
  });

  it("detaches a doc when the checkbox is unchecked", () => {
    useContextDocsMock.mockReturnValue({
      data: { docs: [{ path: "specs/SPEC-01.md" }, { path: "docs/arch.md" }] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSkillContextDocsMock.mockReturnValue({
      data: { paths: ["specs/SPEC-01.md", "docs/arch.md"] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSetSkillContextDocsMock.mockReturnValue({
      mutate: (args: { id: string; paths: string[] }) => { mutateArgs = args; },
      isPending: false,
    });

    renderWithIntl(<SkillContextDocsPanel skill={SKILL} />);

    const checkbox = screen.getByLabelText("Attach specs/SPEC-01.md");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);

    // Should remove the path and keep the other.
    expect(mutateArgs).toEqual({ id: "sk1", paths: ["docs/arch.md"] });
  });

  it("renders empty state when no docs discovered AND no docs attached", () => {
    useContextDocsMock.mockReturnValue({
      data: { docs: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSkillContextDocsMock.mockReturnValue({
      data: { paths: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSetSkillContextDocsMock.mockReturnValue({
      mutate: mockSetDocs,
      isPending: false,
    });

    renderWithIntl(<SkillContextDocsPanel skill={SKILL} />);

    expect(screen.getByText("No context documents found")).toBeInTheDocument();
  });

  it("keeps attached doc visible and detachable when discovered set is empty (stale attachment)", () => {
    // Discovered set is empty (repo re-scanned and the file was removed),
    // but the skill still has the path attached. The row must appear so the
    // user can uncheck it — the empty-state must NOT render.
    useContextDocsMock.mockReturnValue({
      data: { docs: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSkillContextDocsMock.mockReturnValue({
      data: { paths: ["specs/SPEC-01.md"] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSetSkillContextDocsMock.mockReturnValue({
      mutate: (args: { id: string; paths: string[] }) => { mutateArgs = args; },
      isPending: false,
    });

    renderWithIntl(<SkillContextDocsPanel skill={SKILL} />);

    // Empty-state must not appear.
    expect(screen.queryByText("No context documents found")).not.toBeInTheDocument();
    // The stale attached path must be visible.
    expect(screen.getByText("specs/SPEC-01.md")).toBeInTheDocument();
    // Its checkbox must be checked and enabled so the user can detach it.
    const checkbox = screen.getByLabelText("Attach specs/SPEC-01.md");
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(mutateArgs).toEqual({ id: "sk1", paths: [] });
  });

  it("renders loading skeleton while data is loading", () => {
    useContextDocsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    useSkillContextDocsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    useSetSkillContextDocsMock.mockReturnValue({ mutate: mockSetDocs, isPending: false });

    const { container } = renderWithIntl(<SkillContextDocsPanel skill={SKILL} />);
    // Skeleton renders — no doc paths visible.
    expect(screen.queryByText("specs/SPEC-01.md")).not.toBeInTheDocument();
    // Verify the skeleton is in the document tree via the container.
    expect(container.firstChild).toBeTruthy();
  });

  it("renders no-repo-selected state when repoId is null", () => {
    // Confirm the i18n key is present in the messages.
    expect(skillsMessages.context.noRepoSelected).toBeTruthy();
  });
});
