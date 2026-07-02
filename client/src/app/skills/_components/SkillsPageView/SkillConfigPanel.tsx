"use client";

import React from "react";
import { Button, FormField, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/providers/toast";
import { s } from "./styles";

const TYPES: { value: SkillType; label: string }[] = [
  { value: "rubric", label: "Rubric" },
  { value: "convention", label: "Convention" },
  { value: "security", label: "Security" },
  { value: "custom", label: "Custom" },
];

export function SkillConfigPanel({ skill, onDeleted }: { skill: Skill; onDeleted: () => void }) {
  const toast = useToast();
  const update = useUpdateSkill();
  const remove = useDeleteSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id, skill.version, skill.name, skill.description, skill.type, skill.enabled, skill.body]);

  const save = async () => {
    const saved = await update.mutateAsync({
      id: skill.id,
      patch: { name: name.trim(), description: description.trim(), type, body: body.trim(), enabled },
    });
    toast.success(`${saved.name} saved (v${saved.version})`);
  };

  const deleteSkill = async () => {
    if (!window.confirm(`Delete skill "${skill.name}"? It will be detached from every agent.`)) return;
    await remove.mutateAsync(skill.id);
    onDeleted();
  };

  const valid = Boolean(name.trim() && description.trim() && body.trim());
  return (
    <div style={s.panel}>
      <div style={s.sectionTitleRow}>
        <h2 style={s.sectionTitle}>Configuration</h2>
        <span style={s.versionChip}>v{skill.version}</span>
        <label style={s.enabledLabel}>
          Enabled <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label="Name" required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>
      <FormField label="Description" required hint="Write this as a directive: what the reviewer must do when this skill is enabled.">
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label="Type">
        <SelectInput value={type} onChange={(value) => setType(value as SkillType)} options={TYPES} mono={false} />
      </FormField>
      <FormField label="Skill body" required hint="Changing the Markdown body creates a new immutable version.">
        <div style={s.editorShell}>
          <div style={s.editorBar}>
            <span className="mono">{skill.name}.md</span>
            {body !== skill.body && <span style={s.unsaved}>unsaved</span>}
            <span style={s.tokenEstimate}>~{Math.ceil(body.length / 4).toLocaleString()} tokens</span>
          </div>
          <Textarea value={body} onChange={setBody} rows={22} mono />
        </div>
      </FormField>
      <div style={s.actions}>
        <Button kind="ghost" icon="Trash" onClick={() => void deleteSkill()} disabled={remove.isPending}>Delete</Button>
        <Button kind="primary" icon="Check" onClick={() => void save()} disabled={!valid || update.isPending}>
          {update.isPending ? "Saving…" : "Save skill"}
        </Button>
      </div>
    </div>
  );
}
