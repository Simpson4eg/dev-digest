/* ProjectContextView — Project Context discovery screen (Task 6 / AC-3).
   Lists every .md discovered under specs/, docs/, or insights/ in the cloned
   repo. Empty list → empty state, no error (AC-3). No editing of doc files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useContextDocs } from "@/lib/hooks/project-context";
import { DocRow } from "./DocRow";
import { s } from "./styles";

interface Props {
  repoId: string;
}

export function ProjectContextView({ repoId }: Props) {
  const t = useTranslations("context.docs");
  const { data, isLoading, isError } = useContextDocs(repoId);
  const docs = data?.docs ?? [];

  const crumb = [
    { label: t("crumb") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.layout}>
        <div style={s.header}>
          <h1 style={s.heading}>{t("title")}</h1>
          <p style={s.subtitle}>{t("subtitle")}</p>
          {docs.length > 0 && (
            <span style={s.meta}>{t("docCount", { count: docs.length })}</span>
          )}
        </div>

        {isError && (
          <p style={s.error}>{t("loadError")}</p>
        )}

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        )}

        {!isLoading && !isError && docs.length === 0 && (
          <EmptyState
            icon="FileText"
            title={t("empty.title")}
            body={t("empty.body")}
          />
        )}

        {!isLoading && !isError && docs.length > 0 && (
          <div style={s.list}>
            {docs.map((doc) => (
              <DocRow key={doc.path} path={doc.path} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
