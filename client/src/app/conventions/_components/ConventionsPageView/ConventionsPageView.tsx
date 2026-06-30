"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@devdigest/ui";

import type { ConventionCandidate } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/providers/repo-context";
import { AppShell } from "@/components/app-shell";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "./ConventionCard";
import { CreateSkillModal } from "./CreateSkillModal";
import { s } from "./styles";

export function ConventionsPageView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo } = useActiveRepo();

  const { data: candidates, isLoading, isError } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);

  const [showCreateSkill, setShowCreateSkill] = React.useState(false);

  const githubBaseUrl =
    activeRepo?.full_name ? `https://github.com/${activeRepo.full_name}/blob/${activeRepo.default_branch}` : null;

  const accepted = (candidates ?? []).filter((c) => c.status === "accepted");

  const handleAction = (id: string, status: "accepted" | "rejected" | "candidate") => {
    update.mutate({ id, patch: { status } });
  };

  const crumb = [
    { label: t("page.crumbLab"), href: "/skills" },
    { label: t("page.crumbConventions") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <div style={s.header}>
          <div style={s.headingBlock}>
            <h1 style={s.heading}>
              {t("page.headingPrefix")}
              <span style={{ color: "var(--accent)" }}>
                {activeRepo?.full_name ?? t("page.repoFallback")}
              </span>
            </h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
            {candidates && candidates.length > 0 && (
              <span style={s.meta}>
                {t("page.candidateCount", { count: candidates.length })}
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            {accepted.length > 0 && (
              <Button
                kind="secondary"
                icon="Sparkles"
                onClick={() => setShowCreateSkill(true)}
              >
                Create skill ({accepted.length})
              </Button>
            )}
            <Button
              kind="primary"
              icon="RefreshCw"
              disabled={extract.isPending || !repoId}
              onClick={() => extract.mutate()}
            >
              {extract.isPending ? t("page.scanning") : candidates?.length ? t("page.rescan") : t("page.runExtraction")}
            </Button>
          </div>
        </div>

        {isError && (
          <p style={{ color: "var(--error)", fontSize: 13 }}>{t("page.loadError")}</p>
        )}

        {extract.isError && (
          <p style={{ color: "var(--error)", fontSize: 13 }}>{t("page.extractionFailed")}</p>
        )}

        {isLoading && (
          <div style={s.candidateList}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 60, borderRadius: 8 }} />
            ))}
          </div>
        )}

        {!isLoading && candidates?.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => extract.mutate()}
            ctaLoading={extract.isPending}
          />
        )}

        {!isLoading && candidates && candidates.length > 0 && (
          <div style={s.candidateList}>
            {candidates.map((c) => (
              <ConventionCard
                key={c.id}
                candidate={c}
                pending={update.isPending}
                githubBaseUrl={githubBaseUrl}
                onAccept={() =>
                  handleAction(c.id, c.status === "accepted" ? "candidate" : "accepted")
                }
                onReject={() =>
                  handleAction(c.id, c.status === "rejected" ? "candidate" : "rejected")
                }
              />
            ))}
          </div>
        )}
      </div>

      {showCreateSkill && repoId && (
        <CreateSkillModal
          repoId={repoId}
          accepted={accepted}
          onClose={() => setShowCreateSkill(false)}
          onSaved={() => {
            accepted.forEach((c) =>
              update.mutate({ id: c.id, patch: { status: "candidate" } }),
            );
            setShowCreateSkill(false);
          }}
        />
      )}
    </AppShell>
  );
}
