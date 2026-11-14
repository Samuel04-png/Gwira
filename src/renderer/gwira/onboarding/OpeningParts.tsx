import React from 'react';
import {GwiraLogo} from '../../components/GwiraLogo.js';
import {Icon} from '../../components/Icon.js';
import {startingPoints,moreStartingPoints} from './startingPoints.js';

/** Logo, heading and subtitle shared by every Meet Gwira opening. */
export function OpeningWelcome():React.ReactElement {
 return <div className="meet-gwira__welcome"><span className="meet-gwira__logo"><GwiraLogo size="empty"/></span><h1>What would you like Gwira to help with?</h1><p>Start with a problem, a project, or an idea.</p></div>;
}

/** Compact starting points. Choosing one fills an editable draft and never submits. */
export function IdeaGrid({input,more,onMore,onPick}:{input:string;more:boolean;onMore:()=>void;onPick:(prompt:string)=>void}):React.ReactElement {
 return <section className="meet-gwira__ideas" aria-labelledby="meet-ideas"><h2 id="meet-ideas" className="meet-gwira__label">Or start with an idea</h2>
  <ul>{[...startingPoints,...(more?moreStartingPoints:[])].map(point=><li key={point.id}><button type="button" className="meet-gwira__idea" aria-pressed={input===point.prompt} onClick={()=>onPick(point.prompt)}><Icon name={point.icon}/><span><strong>{point.title}</strong><small>{point.description}</small></span></button></li>)}</ul>
  {!more&&<button type="button" className="meet-gwira__more is-ghost" onClick={onMore}>More ideas</button>}</section>;
}
