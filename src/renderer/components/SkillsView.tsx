import { Icon, SkillGlyph as SkillIcon } from "./Icon.js";
import React from 'react';
import {Toggle} from './Toggle.js';
import type { CodexSkillInfo } from '../../shared/types.js';

export function SkillsView({ skills, search, loading, onSearch, onRefresh, onCreate, onLearnMore, onOpen, onToggle, unavailable = false }: {
  skills: CodexSkillInfo[];
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onLearnMore: () => void;
  onOpen: (skillId: string) => void;
  onToggle: (skillId: string, enabled: boolean) => void | Promise<void>;
  unavailable?: boolean;
}): React.ReactElement {
  const query = search.trim().toLowerCase();
  const filtered = query ? skills.filter((skill) => `${skill.name} ${skill.description ?? ''} ${skill.id}`.toLowerCase().includes(query)) : skills;
  return <section className="skills-page">
    <header className="skills-toolbar">
      <button type="button" onClick={onRefresh} disabled={loading||unavailable}><Icon name="refresh" /> Refresh</button>
      <label className="skills-search"><span><Icon name="search" /></span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search skills" disabled={unavailable} /></label>
      <button className="new-skill-button" type="button" onClick={onCreate} disabled={unavailable}><Icon name="plus" /> New skill</button>
    </header>
    <div className="skills-heading"><h1>Skills</h1><p>Give Gwira new skills. <button type="button" onClick={onLearnMore} disabled={unavailable}>Learn more</button></p></div>
    <h2 className="skills-section-title">Installed</h2>
    {unavailable?<p role="status">Skills are unavailable in authenticated workspaces.</p>:loading?<p role="status">Loading installed skills…</p>:!filtered.length?<p>{search?'No skills match this search.':'No skills installed.'}</p>:null}<div className="skills-grid">
      {!unavailable&&filtered.map((skill) => <article className={`skill-card ${skill.enabled === false ? 'disabled' : ''}`} key={skill.id}>
        <button type="button" className="skill-card__open" aria-label={`View ${skill.name} skill`} onClick={()=>onOpen(skill.id)}><span className="skill-card__icon"><SkillIcon skill={skill}/></span><span className="skill-card__copy"><strong title={skill.name}>{skill.name}</strong><span className="skill-card__description" title={skill.description}>{skill.description || 'No description'}</span></span></button>
        <Toggle label={`${skill.enabled === false ? 'Enable' : 'Disable'} ${skill.name}`} checked={skill.enabled!==false} onChange={enabled=>onToggle(skill.id,enabled)}/>

      </article>)}
    </div>
  </section>;
}
