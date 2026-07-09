"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./IntentPanel";
import { BlastRadiusPanel } from "./BlastRadiusPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null | undefined;
  repoFullName: string | null | undefined;
  headSha: string | null | undefined;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      <IntentPanel prId={prId} />

      <BlastRadiusPanel prId={prId} repoFullName={repoFullName} headSha={headSha} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
