import React from 'react';
import type { CodexSkillInfo } from '../../shared/types.js';

export function SkillsView({ skills, search, loading, onSearch, onRefresh, onCreate, onLearnMore, onOpen, onToggle }: {
  skills: CodexSkillInfo[];
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onLearnMore: () => void;
  onOpen: (skillId: string) => void;
  onToggle: (skillId: string, enabled: boolean) => void;
}): React.ReactElement {
  const query = search.trim().toLowerCase();
  const filtered = query ? skills.filter((skill) => `${skill.name} ${skill.description ?? ''} ${skill.id}`.toLowerCase().includes(query)) : skills;
  return <section className="skills-page">
    <header className="skills-toolbar">
      <button type="button" onClick={onRefresh} disabled={loading}>↻ Refresh</button>
      <label className="skills-search"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search skills" /></label>
      <button className="new-skill-button" type="button" onClick={onCreate}>＋ New skill</button>
    </header>
    <div className="skills-heading"><h1>Skills</h1><p>Give Codex superpowers. <button type="button" onClick={onLearnMore}>Learn more</button></p></div>
    <h2 className="skills-section-title">Installed</h2>
    <div className="skills-grid">
      {filtered.map((skill) => <article className={`skill-card ${skill.enabled === false ? 'disabled' : ''}`} key={skill.id} onClick={() => onOpen(skill.id)}>
        <SkillIcon skill={skill} />
        <div><strong>{skill.name}</strong><span>{skill.description || 'No description'}</span></div>
        <button className={`skill-toggle ${skill.enabled === false ? '' : 'on'}`} type="button" onClick={(event) => { event.stopPropagation(); onToggle(skill.id, skill.enabled === false); }} aria-label={`${skill.enabled === false ? 'Enable' : 'Disable'} ${skill.name}`}><span /></button>
      </article>)}
    </div>
  </section>;
}

function SkillIcon({ skill, large = false }: { skill: Pick<CodexSkillInfo, 'id' | 'name'>; large?: boolean }): React.ReactElement {
  const key = `${skill.id} ${skill.name}`.toLowerCase();
  let symbol = '▣';
  if (key.includes('pdf')) symbol = 'PDF';
  else if (key.includes('image')) symbol = '◒';
  else if (key.includes('review')) symbol = '☃';
  else if (key.includes('plugin')) symbol = '✎';
  return <span className={`skill-icon ${large ? 'large' : ''} ${symbol === 'PDF' ? 'pdf' : ''}`}>{symbol}</span>;
}
