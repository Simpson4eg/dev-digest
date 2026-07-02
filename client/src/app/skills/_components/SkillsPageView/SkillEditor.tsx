"use client";

import React from "react";
import { Button, Drawer, FormField, SelectInput, Textarea, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/providers/toast";
import { s } from "./styles";

const TYPES: { value: SkillType; label: string }[] = [
  { value: "rubric", label: "Rubric" },
  { value: "convention", label: "Convention" },
  { value: "security", label: "Security" },
  { value: "custom", label: "Custom" },
];

export function SkillEditor({ skill, onClose, onSaved }: { skill?: Skill; onClose: () => void; onSaved?: (skill: Skill) => void }) {
  const toast = useToast();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? "custom");
  const [body, setBody] = React.useState(skill?.body ?? "# Instructions\n");
  const [enabled, setEnabled] = React.useState(skill?.enabled ?? true);
  const pending = create.isPending || update.isPending;
  const valid = name.trim() && description.trim() && body.trim();

  const save = async () => {
    const input = { name: name.trim(), description: description.trim(), type, body: body.trim(), enabled };
    const saved = skill
      ? await update.mutateAsync({ id: skill.id, patch: input })
      : await create.mutateAsync(input);
    toast.success(`${saved.name} saved (v${saved.version})`);
    onSaved?.(saved);
    onClose();
  };

  return (
    <Drawer
      width={720}
      title={skill ? "Edit skill" : "Create skill"}
      subtitle="Skills are reusable text instructions appended to an agent prompt."
      onClose={onClose}
      footer={
        <div style={s.drawerActions}>
          <Button kind="ghost" onClick={onClose}>Cancel</Button>
          <Button kind="primary" icon="Check" onClick={() => void save()} disabled={!valid || pending}>
            {pending ? "Saving…" : "Save skill"}
          </Button>
        </div>
      }
    >
      <FormField label="Name" required><TextInput value={name} onChange={setName} placeholder="api-contract-gate" mono /></FormField>
      <FormField label="Description" required hint="Write this as a directive: what the reviewer must do when this skill is enabled.">
        <TextInput value={description} onChange={setDescription} placeholder="Detect breaking API contract changes before merge." />
      </FormField>
      <FormField label="Type"><SelectInput value={type} onChange={(value) => setType(value as SkillType)} options={TYPES} mono={false} /></FormField>
      <FormField label="Enabled" hint="Global kill switch. Disabled skills stay attached to agents but are omitted from prompts.">
        <Toggle on={enabled} onChange={setEnabled} />
      </FormField>
      <FormField label="Body (Markdown)" required hint="Changing the body creates a new immutable skill version.">
        <Textarea value={body} onChange={setBody} rows={18} mono />
      </FormField>
    </Drawer>
  );
}
