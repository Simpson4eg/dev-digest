/* EvalsTab — per-agent eval case management + run-all.
   Mirrors the sibling SkillsTab/ContextTab structure (T9, SPEC-03 AC-5).

   Features:
   - Lists the agent's eval cases (GET /agents/:id/eval-cases)
   - Per-case pass/fail label from the latest in-session run (not color-only — a11y)
   - "New eval case" modal (Diff / Files / PR-meta input tabs + expected-JSON)
   - "Run-all-evals" button (POST /agents/:id/eval-runs)
   - Empty state when zero cases */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Modal, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCase, EvalRunGroupResult, EvalRunResult } from "@devdigest/shared";
import { useEvalCases, useDeleteEvalCase, useRunAgentEvals, useCreateEvalCaseManual, useRunHistory, useRunEvalCase } from "@/lib/hooks/evals";
import { s } from "./styles";

// ---------------------------------------------------------------------------
// Pass/Fail badge — text + icon, never color alone (a11y, SPEC-03 Non-functional)
// ---------------------------------------------------------------------------

function PassFailBadge({ pass }: { pass: boolean }) {
  const t = useTranslations("eval.evalsTab");
  return (
    <span style={s.passBadge(pass)} aria-label={pass ? t("passed") : t("failed")}>
      {pass ? <Icon.CheckCircle size={12} aria-hidden="true" /> : <Icon.XCircle size={12} aria-hidden="true" />}
      {pass ? t("passed") : t("failed")}
    </span>
  );
}

function NeverRunBadge() {
  const t = useTranslations("eval.evalsTab");
  return (
    <span style={s.neverRun} aria-label={t("neverRun")}>
      <Icon.Clock size={12} aria-hidden="true" />
      {t("neverRun")}
    </span>
  );
}

/** Read the discriminated `expected_output.type`; null when absent/malformed. */
function evalCaseMustFind(evalCase: EvalCase): boolean | null {
  const eo = evalCase.expected_output;
  if (!eo || typeof eo !== "object" || !("type" in eo)) return null;
  const type = (eo as { type?: unknown }).type;
  return type === "must_find" ? true : type === "must_not_flag" ? false : null;
}

/** Expectation-type badge — green `must_find` / red `must_not_flag` (+ text). */
function TypeBadge({ mustFind }: { mustFind: boolean }) {
  return (
    <span style={s.typeBadge(mustFind)} aria-label={mustFind ? "expects must_find" : "expects must_not_flag"}>
      {mustFind ? "must_find" : "must_not_flag"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DiffPreview — lightweight unified-diff colourizer (green +, red −, hunk @@)
// ---------------------------------------------------------------------------

function diffLineStyle(kind: "add" | "del" | "hunk" | "ctx"): React.CSSProperties {
  const base: React.CSSProperties = { whiteSpace: "pre-wrap", padding: "0 6px" };
  if (kind === "add") return { ...base, background: "rgba(46,160,67,0.15)", color: "var(--ok, #3fb950)" };
  if (kind === "del") return { ...base, background: "rgba(248,81,73,0.15)", color: "var(--crit, #f85149)" };
  if (kind === "hunk") return { ...base, color: "var(--accent, #58a6ff)" };
  return { ...base, color: "var(--text-muted)" };
}

function DiffPreview({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre
      style={{
        margin: 0,
        maxHeight: 280,
        overflow: "auto",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 12,
        fontFamily: "var(--font-mono, monospace)",
        lineHeight: 1.5,
        padding: "8px 0",
      }}
      tabIndex={0}
      aria-label="Diff preview"
    >
      {lines.map((ln, i) => {
        const kind: "add" | "del" | "hunk" | "ctx" =
          ln.startsWith("+") && !ln.startsWith("+++")
            ? "add"
            : ln.startsWith("-") && !ln.startsWith("---")
              ? "del"
              : ln.startsWith("@@")
                ? "hunk"
                : "ctx";
        return (
          <div key={i} style={diffLineStyle(kind)}>
            {ln || " "}
          </div>
        );
      })}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// LastRunStatus — "Last run passed · expected N, got M · 1.8s · $0.02"
// ---------------------------------------------------------------------------

/** Count findings in an expected_output payload ({ findings: [...] }); 0 otherwise. */
function countExpectedFindings(expected: unknown): number {
  if (expected && typeof expected === "object" && "findings" in expected) {
    const f = (expected as { findings?: unknown }).findings;
    return Array.isArray(f) ? f.length : 0;
  }
  return 0;
}

function LastRunStatus({ result }: { result: EvalRunResult }) {
  const r = result.result;
  const trace = r.per_trace?.[0];
  const pass = trace?.pass ?? false;
  const expected = countExpectedFindings(trace?.expected);
  const got = Array.isArray(trace?.actual) ? trace!.actual.length : 0;
  const secs = (r.duration_ms / 1000).toFixed(1);
  const cost = r.cost_usd != null ? `$${r.cost_usd.toFixed(2)}` : "—";

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 8,
        fontSize: 13,
        border: "1px solid var(--border)",
        background: pass ? "rgba(46,160,67,0.10)" : "rgba(248,81,73,0.10)",
        color: pass ? "var(--ok, #3fb950)" : "var(--crit, #f85149)",
      }}
    >
      {pass ? <Icon.CheckCircle size={14} aria-hidden="true" /> : <Icon.XCircle size={14} aria-hidden="true" />}
      <span>
        Last run {pass ? "passed" : "failed"} · expected {expected} finding{expected !== 1 ? "s" : ""}, got {got} ·{" "}
        {secs}s · {cost}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New eval case modal — Diff / Files / PR-meta input tabs + expected JSON
// ---------------------------------------------------------------------------

const INPUT_TABS = ["diff", "files", "prMeta"] as const;
type InputTab = (typeof INPUT_TABS)[number];

const DEFAULT_EXPECTED = JSON.stringify(
  {
    type: "must_find",
    findings: [
      {
        file: "src/example.ts",
        start_line: 1,
        end_line: 1,
        severity: "critical",
        title: "Example finding title",
        body: "Describe what the agent must flag.",
      },
    ],
  },
  null,
  2,
);

interface NewCaseModalProps {
  agentId: string;
  onClose: () => void;
  onCreated: () => void;
}

function NewCaseModal({ agentId, onClose, onCreated }: NewCaseModalProps) {
  const t = useTranslations("eval.caseEditor");
  const [inputTab, setInputTab] = React.useState<InputTab>("diff");
  const [name, setName] = React.useState("");
  const [diff, setDiff] = React.useState("");
  const [prTitle, setPrTitle] = React.useState("");
  const [prBody, setPrBody] = React.useState("");
  const [expectedJson, setExpectedJson] = React.useState(DEFAULT_EXPECTED);
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  // Use typed api.post mutation instead of raw fetch (CLIENT-001/002).
  const createCase = useCreateEvalCaseManual();
  const runCase = useRunEvalCase();
  const [runOnSave, setRunOnSave] = React.useState(true);
  const [lastResult, setLastResult] = React.useState<EvalRunResult | null>(null);

  const validateJson = (value: string) => {
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError(t("invalidJson"));
    }
  };

  const handleExpectedChange = (value: string) => {
    setExpectedJson(value);
    validateJson(value);
  };

  const handleSave = async () => {
    if (jsonError) return;
    let expectedOutput: unknown;
    try {
      expectedOutput = JSON.parse(expectedJson);
    } catch {
      setJsonError(t("invalidJson"));
      return;
    }

    try {
      const created = await createCase.mutateAsync({
        agentId,
        owner_kind: "agent",
        owner_id: agentId,
        name: name || "Unnamed case",
        input_diff: diff,
        input_meta: prTitle || prBody ? { title: prTitle, body: prBody } : undefined,
        expected_output: expectedOutput,
      });
      onCreated();
      if (runOnSave) {
        // Run the freshly-created case and keep the modal open to show the status.
        const res = await runCase.mutateAsync({ agentId, caseId: created.id });
        setLastResult(res.results[0] ?? null);
      } else {
        onClose();
      }
    } catch {
      // Errors are surfaced by the hooks' onError toasts — modal stays open so
      // the user can retry (CLIENT-002).
    }
  };

  const saving = createCase.isPending || runCase.isPending;

  return (
    <Modal
      width={740}
      title={t("newCase")}
      subtitle="Provide a diff and the findings this agent must (or must not) emit."
      onClose={onClose}
      footer={
        <div style={{ ...s.modalFooter, justifyContent: "space-between", alignItems: "center" }}>
          <label
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={runOnSave}
              onChange={(e) => setRunOnSave(e.target.checked)}
              aria-label="Run the case immediately after saving"
            />
            Run on save
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <Button kind="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              kind="primary"
              onClick={handleSave}
              loading={saving}
              disabled={!!jsonError || saving}
            >
              {saving ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.modalBody}>
        {/* Name */}
        <div>
          <div style={s.modalLabel}>{t("nameLabel")}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            style={s.modalInput}
          />
        </div>

        {/* Input (Diff / Files / PR meta tabs) */}
        <div>
          <div style={s.modalLabel}>{t("inputLabel")}</div>
          <div style={s.inputTabBar} role="tablist">
            {INPUT_TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={inputTab === tab}
                style={s.inputTab(inputTab === tab)}
                onClick={() => setInputTab(tab)}
              >
                {tab === "diff" ? t("tabs.diff") : tab === "prMeta" ? t("tabs.prMeta") : "Files"}
              </button>
            ))}
          </div>
          {inputTab === "diff" && (
            <>
              <textarea
                value={diff}
                onChange={(e) => setDiff(e.target.value)}
                placeholder={t("diffPlaceholder")}
                rows={10}
                style={s.modalTextarea}
              />
              {diff.trim() !== "" && (
                <div style={{ marginTop: 8 }}>
                  <div style={s.modalLabel}>Preview</div>
                  <DiffPreview diff={diff} />
                </div>
              )}
            </>
          )}
          {inputTab === "files" && (
            <textarea
              placeholder="Paste file contents as JSON array, e.g. [{&quot;path&quot;: &quot;src/index.ts&quot;, &quot;content&quot;: &quot;...&quot;}]"
              rows={10}
              style={s.modalTextarea}
            />
          )}
          {inputTab === "prMeta" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={s.modalLabel}>{t("titleLabel")}</div>
                <input
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  style={s.modalInput}
                />
              </div>
              <div>
                <div style={s.modalLabel}>{t("bodyLabel")}</div>
                <textarea
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  placeholder={t("bodyPlaceholder")}
                  rows={5}
                  style={s.modalTextarea}
                />
              </div>
            </div>
          )}
        </div>

        {/* Expected output (findings JSON) */}
        <div>
          <div style={{ ...s.modalLabel, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>
              {t("expectedOutput")}
              {jsonError ? (
                <span style={{ color: "var(--crit)", marginLeft: 8 }}>{jsonError}</span>
              ) : (
                <span style={{ color: "var(--ok)", marginLeft: 8 }}>{t("validJson")}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => handleExpectedChange(DEFAULT_EXPECTED)}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              + Finding skeleton
            </button>
          </div>
          <textarea
            value={expectedJson}
            onChange={(e) => handleExpectedChange(e.target.value)}
            rows={12}
            style={s.modalTextarea}
          />
        </div>

        {/* Last-run status (shown after a "Run on save" run) */}
        {lastResult && <LastRunStatus result={lastResult} />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// View eval case modal — read-only: expectation type + frozen input + expected JSON
// ---------------------------------------------------------------------------

function ViewCaseModal({
  evalCase,
  agentId,
  onClose,
}: {
  evalCase: EvalCase;
  agentId: string;
  onClose: () => void;
}) {
  const eo = evalCase.expected_output;
  const type =
    eo && typeof eo === "object" && "type" in eo
      ? String((eo as { type?: unknown }).type)
      : "unknown";

  const runCase = useRunEvalCase();
  const [lastResult, setLastResult] = React.useState<EvalRunResult | null>(null);

  const handleRunCase = async () => {
    try {
      const res = await runCase.mutateAsync({ agentId, caseId: evalCase.id });
      setLastResult(res.results[0] ?? null);
    } catch {
      // Error toasted by the hook's onError.
    }
  };

  const running = runCase.isPending;
  const diff = evalCase.input_diff || "";

  return (
    <Modal
      width={740}
      title={evalCase.name}
      subtitle="This case's frozen input and expected output. Run it to check the agent."
      onClose={onClose}
      footer={
        <div style={s.modalFooter}>
          <Button kind="ghost" onClick={onClose} disabled={running}>
            Close
          </Button>
          <Button kind="primary" icon="Play" onClick={handleRunCase} loading={running} disabled={running}>
            {running ? "Running…" : "Run case"}
          </Button>
        </div>
      }
    >
      <div style={s.modalBody}>
        <div>
          <div style={s.modalLabel}>Expectation type</div>
          <div style={{ fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>{type}</div>
        </div>

        <div>
          <div style={s.modalLabel}>Input diff (frozen)</div>
          {diff ? <DiffPreview diff={diff} /> : <div style={s.meta}>(no diff stored)</div>}
        </div>

        <div>
          <div style={s.modalLabel}>Expected output (JSON)</div>
          <textarea readOnly value={JSON.stringify(eo, null, 2)} rows={12} style={s.modalTextarea} />
        </div>

        {/* Last-run status (shown after "Run case") */}
        {lastResult && <LastRunStatus result={lastResult} />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// EvalsTab — main component
// ---------------------------------------------------------------------------

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval.evalsTab");
  const cases = useEvalCases(agent.id);
  const deleteMut = useDeleteEvalCase();
  const runMut = useRunAgentEvals();

  const [showNewModal, setShowNewModal] = React.useState(false);
  const [viewCase, setViewCase] = React.useState<EvalCase | null>(null);
  // Per-case pass/fail from the run just triggered in this session (immediate).
  const [lastRunResults, setLastRunResults] = React.useState<EvalRunResult[] | null>(null);
  // Persisted latest-run results (survives refresh); refetched after a run via
  // the shared qk.evalRunGroups invalidation in useRunAgentEvals.
  const history = useRunHistory(agent.id);

  const passMap = React.useMemo(() => {
    const m = new Map<string, boolean>();
    // Persisted: the latest run group's per-case rows.
    for (const r of history.data?.recent_runs ?? []) {
      if (r.pass != null) m.set(r.case_id, r.pass);
    }
    // In-session run overrides (lands before the refetch completes).
    if (lastRunResults) {
      for (const r of lastRunResults) m.set(r.case_id, r.result.per_trace?.[0]?.pass ?? false);
    }
    return m;
  }, [history.data, lastRunResults]);

  const handleRunAll = () => {
    runMut.mutate(
      { agentId: agent.id },
      {
        onSuccess: (data: EvalRunGroupResult) => {
          setLastRunResults(data.results);
        },
      },
    );
  };

  const handleDelete = (evalCase: EvalCase) => {
    deleteMut.mutate({ agentId: agent.id, caseId: evalCase.id });
  };

  if (cases.isLoading) return <Skeleton height={220} />;
  if (cases.isError)
    return (
      <ErrorState
        body="Could not load eval cases."
        onRetry={() => void cases.refetch()}
      />
    );

  const caseList = cases.data ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("casesHeading")}</h2>
        <span style={s.count}>{caseList.length} case{caseList.length !== 1 ? "s" : ""}</span>
        <div style={s.runBtn}>
          <Button
            kind="secondary"
            icon="Play"
            loading={runMut.isPending}
            disabled={caseList.length === 0 || runMut.isPending}
            onClick={handleRunAll}
          >
            {runMut.isPending ? t("running") : t("run")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            onClick={() => setShowNewModal(true)}
          >
            {t("newCase")}
          </Button>
        </div>
      </div>

      <p style={s.hint}>
        Eval cases test this agent against frozen inputs. Run-all to score recall / precision / citation accuracy.
      </p>

      {caseList.length === 0 ? (
        <EmptyState
          icon="FlaskConical"
          title="No eval cases yet"
          body={t("emptyCases")}
          cta={t("newCase")}
          onCta={() => setShowNewModal(true)}
        />
      ) : (
        <div style={s.list}>
          {caseList.map((evalCase) => {
            const pass = passMap.get(evalCase.id);
            const mustFind = evalCaseMustFind(evalCase);

            return (
              <div key={evalCase.id} style={{ ...s.row, ...s.rowAccent(mustFind) }}>
                <button
                  type="button"
                  aria-label={`View ${evalCase.name}`}
                  onClick={() => setViewCase(evalCase)}
                  style={{ ...s.text, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}
                >
                  <div style={s.name}>{evalCase.name}</div>
                  {evalCase.notes && <div style={s.meta}>{evalCase.notes}</div>}
                </button>

                {/* Expectation-type badge (green must_find / red must_not_flag) */}
                {mustFind !== null && <TypeBadge mustFind={mustFind} />}

                {/* Pass/Fail — text + icon, NOT color alone (a11y AC) */}
                {pass !== undefined ? <PassFailBadge pass={pass} /> : <NeverRunBadge />}

                <div style={s.controls}>
                  <button
                    aria-label={`Delete ${evalCase.name}`}
                    style={s.deleteBtn}
                    disabled={deleteMut.isPending}
                    onClick={() => handleDelete(evalCase)}
                  >
                    <Icon.Trash size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewModal && (
        <NewCaseModal
          agentId={agent.id}
          onClose={() => setShowNewModal(false)}
          onCreated={() => void cases.refetch()}
        />
      )}

      {viewCase && <ViewCaseModal evalCase={viewCase} agentId={agent.id} onClose={() => setViewCase(null)} />}
    </div>
  );
}
