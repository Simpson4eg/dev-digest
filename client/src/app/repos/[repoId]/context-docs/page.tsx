"use client";

import { useParams } from "next/navigation";
import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context-docs — Project Context discovery screen.
   Lists every .md found under specs/, docs/, or insights/ in the cloned repo.
   Thin page entry — feature logic lives in _components/ProjectContextView.
   Uses useParams() (Next.js 15 App Router / client-component pattern). */
export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ProjectContextView repoId={repoId} />;
}
