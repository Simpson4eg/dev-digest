"use client";

import React from "react";
import { Button, Drawer, FormField, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, Skill, SkillType } from "@devdigest/shared";
import { useCreateConventionSkill } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/providers/toast";
import { s } from "./styles";

const TYPES: { value: SkillType; label: string }[] = [
  { value: "convention", label: "Convention" },
  { value: "rubric", label: "Rubric" },
  { value: "security", label: "Security" },
  { value: "custom", label: "Custom" },
];

interface Props {
  repoId: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
  onSaved?: (skill: Skill) => void;
}

function categoryToType(category: string | null | undefined): SkillType {
  if (category === "security") return "security";
  return "convention";
}

function toSlug(text: string): string {
  return text
    .replace(/^(always|never|use|do not|avoid|prefer)\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .slice(0, 4)
    .join("-");
}

function deriveDefaults(accepted: ConventionCandidate[]): {
  name: string;
  description: string;
  type: SkillType;
} {
  if (accepted.length === 0) {
    return {
      name: "repo-conventions",
      description: "House conventions extracted from this repository.",
      type: "convention",
    };
  }

  if (accepted.length === 1) {
    const c = accepted[0]!;
    const categorySlug = c.category?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "convention";
    return {
      name: `${categorySlug}-${toSlug(c.rule)}`,
      description: c.rule,
      type: categoryToType(c.category),
    };
  }

  const categories = accepted.map((c) => c.category).filter(Boolean) as string[];
  const uniqueCategories = [...new Set(categories)];
  const allSameCategory = uniqueCategories.length === 1 && categories.length === accepted.length;
  const sharedCategory = allSameCategory ? uniqueCategories[0] : null;

  return {
    name: sharedCategory
      ? `${sharedCategory.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-conventions`
      : "repo-conventions",
    description: `Enforce ${accepted.length} ${sharedCategory ?? "house"} conventions extracted from this repository.`,
    type: allSameCategory ? categoryToType(sharedCategory) : "convention",
  };
}

function buildBody(candidates: ConventionCandidate[]): string {
  const sections = candidates.map((c) => {
    const header = c.category ? `## ${c.category}` : "## convention";
    const evidence =
      c.evidence_path
        ? `Detected in \`${c.evidence_path}${c.evidence_line != null ? `:${c.evidence_line}` : ""}\``
        : "";
    const snippet = c.evidence_snippet ? `\n\`\`\`\n${c.evidence_snippet}\n\`\`\`` : "";
    return [header, "", c.rule, evidence, snippet].join("\n").trimEnd();
  });
  return sections.join("\n\n");
}

export function CreateSkillModal({ repoId, accepted, onClose, onSaved }: Props) {
  const toast = useToast();
  const create = useCreateConventionSkill();

  const defaults = React.useMemo(() => deriveDefaults(accepted), [accepted]);

  const [name, setName] = React.useState(defaults.name);
  const [description, setDescription] = React.useState(defaults.description);
  const [type, setType] = React.useState<SkillType>(defaults.type);
  const [body, setBody] = React.useState(() => buildBody(accepted));
  const [enabled, setEnabled] = React.useState(true);

  const valid = name.trim() && description.trim() && body.trim() && accepted.length > 0;

  const save = async () => {
    const skill = await create.mutateAsync({
      repo_id: repoId,
      convention_ids: accepted.map((c) => c.id),
      name: name.trim(),
      description: description.trim(),
      body: body.trim(),
      type,
      enabled,
    });
    toast.success(`Skill "${skill.name}" created (v${skill.version})`);
    onSaved?.(skill);
    onClose();
  };

  return (
    <Drawer
      width={720}
      title="Create skill from conventions"
      subtitle={`Merged from ${accepted.length} accepted convention${accepted.length !== 1 ? "s" : ""}. Everything below is editable before you save.`}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="ghost" onClick={onClose}>Cancel</Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={() => void save()}
            disabled={!valid || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create skill"}
          </Button>
        </div>
      }
    >
      <div style={s.modalBody}>
        <FormField label="Name" required>
          <TextInput value={name} onChange={setName} placeholder="repo-conventions" mono />
        </FormField>
        <FormField label="Description" required hint="Directive: what the reviewer must do when this skill is enabled.">
          <TextInput value={description} onChange={setDescription} placeholder="Enforce house conventions." />
        </FormField>
        <FormField label="Type">
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={TYPES} mono={false} />
        </FormField>
        <FormField label="Enabled" hint="Disabled skills stay attached to agents but are omitted from prompts.">
          <Toggle on={enabled} onChange={setEnabled} />
        </FormField>
        <FormField label="Skill body (Markdown)" required hint="Changing the body creates a new immutable version.">
          <Textarea value={body} onChange={setBody} rows={14} mono />
        </FormField>
      </div>
    </Drawer>
  );
}
