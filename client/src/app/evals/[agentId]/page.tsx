/* Route: /evals/[agentId] — per-agent Eval Detail page (SPEC-03 AC-15/16/18).

   Thin route entry. The view (EvalDetailView) is a client component that reads
   the :agentId segment via useParams(), fetches this agent's run history +
   run groups, and hosts the "Compare runs" selector + comparison modal.

   Reachable from the /evals dashboard (each agent name links here) and by URL. */

import { EvalDetailView } from "./_components/EvalDetailView";

export default function EvalDetailPage() {
  return <EvalDetailView />;
}
