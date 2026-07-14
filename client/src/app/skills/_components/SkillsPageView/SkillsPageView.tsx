"use client";

import React from "react";
import { Badge, Button, Card, Dropdown, EmptyState, ErrorState, Icon, Markdown, Skeleton, Tabs, Toggle } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { ImportSkillDrawer } from "./ImportSkillDrawer";
import { SkillConfigPanel } from "./SkillConfigPanel";
import { SkillContextDocsPanel } from "./SkillContextDocsPanel";
import { SkillEditor } from "./SkillEditor";
import { SkillStatsPanel } from "./SkillStatsPanel";
import { SkillVersionsPanel } from "./SkillVersionsPanel";
import { s } from "./styles";

type SkillTab = "config" | "preview" | "stats" | "versions" | "context";

export function SkillsPageView() {
  const skillsQuery = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<SkillTab>("config");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const skills = skillsQuery.data ?? [];
  const skillIds = skills.map((skill) => skill.id).join(",");

  React.useEffect(() => {
    if (skills.length === 0) {
      setSelectedId(null);
    } else if (!selectedId || !skills.some((skill) => skill.id === selectedId)) {
      setSelectedId(skills[0]!.id);
    }
  }, [skillIds, selectedId, skills]);

  const selected = skills.find((skill) => skill.id === selectedId) ?? null;
  const filtered = skills.filter((skill) =>
    `${skill.name} ${skill.description} ${skill.type}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectSkill = (id: string) => {
    setSelectedId(id);
    setTab("config");
  };

  return (
    <AppShell crumb={[{ label: "Skills Lab" }, { label: "Skills" }]}>
      <div style={s.layout}>
        <aside style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.h1}>Skills</h1>
              <Dropdown
                align="right"
                width={230}
                trigger={<Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">Add skill</Button>}
                items={[
                  { label: "Create from scratch", icon: "Edit", onClick: () => setCreating(true) },
                  { label: "Import Markdown or ZIP", icon: "Upload", onClick: () => setImporting(true) },
                ]}
              />
            </div>
            <div style={s.searchWrap}>
              <Icon.Search size={14} style={s.searchIcon} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search skills…" style={s.search} />
            </div>
          </div>

          <div style={s.skillList}>
            {skillsQuery.isLoading && <><Skeleton height={136} /><Skeleton height={136} /><Skeleton height={136} /></>}
            {skillsQuery.isError && <ErrorState body="Could not load skills." onRetry={() => skillsQuery.refetch()} />}
            {!skillsQuery.isLoading && !skillsQuery.isError && filtered.length === 0 && (
              <EmptyState icon="Sparkles" title="No skills found" body="Create or import a reusable review instruction." cta="Create skill" onCta={() => setCreating(true)} />
            )}
            {filtered.map((skill) => (
              <Card key={skill.id} hover onClick={() => selectSkill(skill.id)} style={s.skillCard(skill.id === selectedId, skill.enabled)}>
                <div style={s.cardHead}>
                  <span style={s.iconBox}><Icon.Sparkles size={14} /></span>
                  <span style={s.name}>{skill.name}</span>
                  <span onClick={(event) => event.stopPropagation()}>
                    <Toggle size={14} on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} />
                  </span>
                </div>
                <p style={s.description}>{skill.description}</p>
                <div style={s.meta}>
                  <Badge>{skill.type}</Badge>
                  <span style={s.source}>{skill.source}</span>
                  <span style={s.version}>v{skill.version}</span>
                </div>
              </Card>
            ))}
          </div>
        </aside>

        <main style={s.editorOuter}>
          {selected ? (
            <>
              <div style={s.editorHeader}>
                <span style={s.editorIcon}><Icon.Sparkles size={16} /></span>
                <h1 style={s.editorTitle}>{selected.name}</h1>
                <Badge>{selected.type}</Badge>
                <Badge mono>v{selected.version}</Badge>
              </div>
              <Tabs
                value={tab}
                onChange={(value) => setTab(value as SkillTab)}
                tabs={[
                  { key: "config", label: "Config" },
                  { key: "preview", label: "Preview" },
                  { key: "context", label: "Context" },
                  { key: "stats", label: "Stats" },
                  { key: "versions", label: "Versions" },
                ]}
                pad="0 28px"
              />
              <div style={s.editorBody}>
                {tab === "config" && <SkillConfigPanel skill={selected} onDeleted={() => setSelectedId(null)} />}
                {tab === "preview" && (
                  <div style={s.panel}>
                    <h2 style={s.sectionTitle}>Preview</h2>
                    <p style={s.sectionHint}>Rendered Markdown exactly as the reviewing agent receives the skill body.</p>
                    <div style={s.markdown}><Markdown>{selected.body}</Markdown></div>
                  </div>
                )}
                {tab === "context" && <SkillContextDocsPanel skill={selected} />}
                {tab === "versions" && <SkillVersionsPanel skill={selected} />}
                {tab === "stats" && <SkillStatsPanel skill={selected} />}
              </div>
            </>
          ) : (
            <div style={s.emptyEditor}><EmptyState icon="Sparkles" title="Select a skill" body="Choose a skill on the left to edit or preview it." /></div>
          )}
        </main>
      </div>
      {creating && <SkillEditor onClose={() => setCreating(false)} onSaved={(skill) => selectSkill(skill.id)} />}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} onSaved={(skill) => selectSkill(skill.id)} />}
    </AppShell>
  );
}
