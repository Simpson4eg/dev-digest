"use client";

import React from "react";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const all = useSkills();
  const links = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();
  const [ordered, setOrdered] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState("");
  const [dragged, setDragged] = React.useState<string | null>(null);
  const persistedOrder = (links.data ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((link) => link.skill_id)
    .join(",");

  React.useEffect(() => {
    setOrdered(persistedOrder ? persistedOrder.split(",") : []);
  }, [agent.id, persistedOrder]);

  const persist = (next: string[]) => {
    setOrdered(next);
    setSkills.mutate({ id: agent.id, skillIds: next });
  };
  const move = (id: string, delta: number) => {
    const from = ordered.indexOf(id);
    const to = Math.max(0, Math.min(from + delta, ordered.length - 1));
    if (from < 0 || from === to) return;
    const next = [...ordered];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    persist(next);
  };
  const dropBefore = (target: string) => {
    if (!dragged || dragged === target) return;
    const next = ordered.filter((id) => id !== dragged);
    next.splice(next.indexOf(target), 0, dragged);
    setDragged(null);
    persist(next);
  };

  if (all.isLoading || links.isLoading) return <Skeleton height={220} />;
  if (all.isError || links.isError) return <ErrorState body="Could not load agent skills." onRetry={() => { void all.refetch(); void links.refetch(); }} />;

  const byId = new Map((all.data ?? []).map((skill) => [skill.id, skill]));
  const orderedSkills = ordered.map((id) => byId.get(id)).filter((skill) => skill != null);
  const unlinked = (all.data ?? []).filter((skill) => !ordered.includes(skill.id));
  const visible = [...orderedSkills, ...unlinked].filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>Skills</h2>
        <span style={s.count}>{ordered.length} of {(all.data ?? []).length} attached</span>
        <div style={s.searchWrap}><Icon.Search size={13} style={s.searchIcon} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter skills…" style={s.search} /></div>
      </div>
      <p style={s.hint}>Order matters: earlier attached skills appear earlier in the assembled prompt. Globally disabled skills are omitted.</p>
      {visible.length === 0 ? <EmptyState icon="Sparkles" title="No skills available" body="Create a skill in Skills Lab, then attach it here." /> : (
        <div style={s.list}>{visible.map((skill) => {
          const attached = ordered.includes(skill.id);
          const index = ordered.indexOf(skill.id);
          return (
            <div key={skill.id} draggable={attached && !setSkills.isPending} onDragStart={() => setDragged(skill.id)} onDragOver={(event) => attached && event.preventDefault()} onDrop={() => attached && dropBefore(skill.id)} style={s.row(attached, skill.enabled)}>
              <span style={s.grip}><Icon.Menu size={14} /></span>
              <input aria-label={`Attach ${skill.name}`} type="checkbox" checked={attached} disabled={setSkills.isPending} onChange={(event) => persist(event.target.checked ? [...ordered, skill.id] : ordered.filter((id) => id !== skill.id))} />
              <div style={s.text}><div style={s.name}>{skill.name}</div><div style={s.description}>{skill.description}</div></div>
              <Badge>{skill.type}</Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">globally disabled</Badge>}
              {attached && <div style={s.controls}><button aria-label={`Move ${skill.name} up`} disabled={setSkills.isPending || index === 0} onClick={() => move(skill.id, -1)} style={s.arrow}><Icon.ArrowUp size={14} /></button><button aria-label={`Move ${skill.name} down`} disabled={setSkills.isPending || index === ordered.length - 1} onClick={() => move(skill.id, 1)} style={s.arrow}><Icon.ArrowDown size={14} /></button></div>}
            </div>
          );
        })}</div>
      )}
    </div>
  );
}
