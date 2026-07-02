"use client";

import React from "react";
import { Badge, Button, Drawer, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useCreateSkill, useSkillImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/providers/toast";
import { s } from "./styles";

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export function ImportSkillDrawer({ onClose, onSaved }: { onClose: () => void; onSaved?: (skill: Skill) => void }) {
  const toast = useToast();
  const preview = useSkillImportPreview();
  const create = useCreateSkill();
  const [trusted, setTrusted] = React.useState(false);

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setTrusted(false);
    preview.reset();
    preview.mutate({ filename: file.name, content_base64: await readBase64(file) });
  };

  const confirm = async () => {
    if (!preview.data || !trusted) return;
    const skill = await create.mutateAsync({
      name: preview.data.name,
      description: preview.data.description,
      type: preview.data.type,
      body: preview.data.body,
      source: "extracted",
      enabled: false,
    });
    toast.success(`${skill.name} imported disabled. Review it before enabling.`);
    onSaved?.(skill);
    onClose();
  };

  return (
    <Drawer
      width={760}
      title="Import skill"
      subtitle="Upload one Markdown file or a ZIP containing one SKILL.md."
      onClose={onClose}
      footer={
        <div style={s.drawerActions}>
          <Button kind="ghost" onClick={onClose}>Cancel</Button>
          <Button kind="primary" icon="Upload" onClick={() => void confirm()} disabled={!preview.data || !trusted || create.isPending}>
            {create.isPending ? "Importing…" : "Confirm import"}
          </Button>
        </div>
      }
    >
      <div style={s.trust}>
        Imported skills are instructions added to an agent prompt. DevDigest reads only the selected Markdown file; scripts, assets and executable archive contents are ignored and never run.
      </div>
      <input style={s.file} type="file" accept=".md,.markdown,.zip" onChange={(event) => void selectFile(event.target.files?.[0])} />
      {preview.isPending && <p>Extracting preview…</p>}
      {preview.isError && <p style={{ color: "var(--crit)" }}>{preview.error.message}</p>}
      {preview.data && (
        <div style={{ marginTop: 22 }}>
          <div style={s.previewMeta}>
            <strong>{preview.data.name}</strong>
            <Badge>{preview.data.type}</Badge>
            <Badge mono>{preview.data.source_file}</Badge>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>{preview.data.description}</p>
          <div style={s.markdown}><Markdown>{preview.data.body}</Markdown></div>
          {preview.data.warnings.map((warning) => <p key={warning} style={s.ignored}>Warning: {warning}</p>)}
          {preview.data.ignored_files.length > 0 && <p style={s.ignored}>Ignored: {preview.data.ignored_files.join(", ")}</p>}
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 18, fontSize: 13 }}>
            <input type="checkbox" checked={trusted} onChange={(event) => setTrusted(event.target.checked)} />
            I reviewed this Markdown and understand that enabling it gives these instructions to linked agents.
          </label>
        </div>
      )}
    </Drawer>
  );
}
