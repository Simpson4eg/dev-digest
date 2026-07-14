/* DocRow — a single discovered context document row.
   Displays the repo-relative path (e.g. "specs/SPEC-01.md"). No editing. */
import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

interface Props {
  path: string;
}

export function DocRow({ path }: Props) {
  return (
    <div style={s.row}>
      <Icon.FileText size={14} style={s.rowIcon} />
      <span style={s.rowPath}>{path}</span>
    </div>
  );
}
