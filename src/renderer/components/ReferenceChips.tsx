import React from 'react';
import type { ComposerFileReference, ComposerSkillReference } from '../composerAttachments.js';
import { Icon } from './Icon.js';

export function ReferenceChips({ skills, files, onRemoveSkill, onRemoveFile }: {
  skills: ComposerSkillReference[];
  files: ComposerFileReference[];
  onRemoveSkill: (id: string) => void;
  onRemoveFile: (path: string) => void;
}): React.ReactElement {
  return (
    <div className="reference-chips">
      {skills.map((skill) => <button className="reference-chip skill" type="button" key={skill.id} onClick={() => onRemoveSkill(skill.id)} aria-label={`Remove skill reference: ${skill.name}`} title={skill.name}><Icon name="skills" /><span className="reference-chip__label">{skill.name}</span><span className="reference-chip__remove" aria-hidden="true"><Icon name="close" /></span></button>)}
      {files.map((file) => <button className="reference-chip file" type="button" key={file.path} onClick={() => onRemoveFile(file.path)} aria-label={`Remove file reference: ${file.relativePath}`} title={file.relativePath}><span aria-hidden="true">@</span><span className="reference-chip__label">{file.relativePath}</span><span className="reference-chip__remove" aria-hidden="true"><Icon name="close" /></span></button>)}
    </div>
  );
}
