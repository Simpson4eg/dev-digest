"use client";

import { useParams } from "next/navigation";
import { ProjectContextView } from "../context-docs/_components/ProjectContextView";

/* Route: /repos/:repoId/project-context - user-facing Project Context screen.
   Reuses the discovery view backed by GET /repos/:repoId/context-docs. */
export default function ProjectContextPage() {
  const { repoId } = useParams<{ repoId: string }>();
  return <ProjectContextView repoId={repoId} />;
}
