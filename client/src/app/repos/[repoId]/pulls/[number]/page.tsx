/* PR Detail — /repos/:repoId/pulls/:number. F2 shell extended by A2 with:
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - Basic file-by-file diff viewer in the Files tab
   Tab state lives in query (?tab). All orchestration lives in usePrDetailPage;
   this component is just the layout. */
"use client";

import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import { PrDetailHeader } from "./_components/PrDetailHeader";
import { OverviewTab } from "./_components/OverviewTab";
import { FindingsTab } from "./_components/findings/FindingsTab";
import { DiffTab } from "./_components/DiffTab";
import RunTraceDrawer from "./_components/trace/RunTraceDrawer";
import { usePrDetailPage } from "./_lib/usePrDetailPage";
import { s } from "./styles";

export default function PRDetailPage() {
  const page = usePrDetailPage();
  const { pr, prId, crumb, tab, traceRunId } = page;

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (page.repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (page.isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loadingStack}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (page.isError || !pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this pull request"
          body={page.error instanceof ApiError ? page.error.message : `PR #${page.number} could not be loaded.`}
          onRetry={page.retry}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={page.findingsCount}
        githubUrl={page.githubUrl(pr.number)}
        onSetTab={page.setTab}
        onRunStart={page.onRunStart}
        onRunsStarted={page.onRunsStarted}
      />

      <div style={s.tabContent}>
        {tab === "overview" && <OverviewTab prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={page.liveRunIds}
            reviewRunning={page.reviewRunning}
            lethalTrifecta={page.lethalTrifecta}
            runs={page.runs}
            prRuns={page.prRuns}
            prCommits={pr.commits}
            repoFullName={page.repoFullName}
            headSha={pr.head_sha}
            cancelMutation={page.cancel}
            onOpenTrace={page.onOpenTrace}
            onDelete={page.onDeleteRun}
            onRunDone={page.onRunDone}
          />
        )}

        {tab === "diff" && (
          <DiffTab
            prId={prId}
            filesCount={pr.files_count}
            files={pr.files}
            canComment={pr.status === "open"}
          />
        )}
      </div>

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={page.traceFindings}
          agentName={page.traceAgentName}
          onClose={page.onCloseTrace}
        />
      )}
    </AppShell>
  );
}
