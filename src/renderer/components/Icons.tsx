import React from 'react';

export function NewThreadIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M11 4H5.5A2.5 2.5 0 0 0 3 6.5v12A2.5 2.5 0 0 0 5.5 21h12A2.5 2.5 0 0 0 20 18.5V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function AutomationsIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export function SkillsNavIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" /><circle cx="7" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" /><circle cx="17" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" /></svg>;
}

export function StopIcon(): React.ReactElement {
  return <svg className="stop-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>;
}

export function LocalComputerIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M3 19H21M6 19H18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

export function FolderIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M4 7.5C4 6.67 4.67 6 5.5 6H9.2L10.8 8H18.5C19.33 8 20 8.67 20 9.5V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 10H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

export function FolderOpenIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h3.2l1.7 2h7.6a2 2 0 0 1 1.9 2.6l-1.9 6A2.5 2.5 0 0 1 16.1 18H5.6a2.1 2.1 0 0 1-2-2.7l1.8-5.8A1.5 1.5 0 0 1 6.8 8.5h13.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function FolderPlusIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M3 6.5C3 5.67 3.67 5 4.5 5H9L11 7H19.5C20.33 7 21 7.67 21 8.5V11M3 8.5V17.5C3 18.33 3.67 19 4.5 19H13M18 14V20M15 17H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function SettingsIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6A1.65 1.65 0 0 0 10.4 2.92V3a2 2 0 1 1 4 0v-.08A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.33.34.64.6 1 .3.37.69.6 1.08.6H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function DeleteThreadIcon(): React.ReactElement {
  return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="14" height="4" rx="1.2" /><path d="M4.5 8v7.5A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V8M8 11.5h4" /></svg>;
}

export function ScheduledIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" /><path d="M12 8v4l2.8 1.7M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

export function ExploreIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" /><path d="m15.2 8.8-2.1 4.3-4.3 2.1 2.1-4.3 4.3-2.1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}

export function SearchIcon({ className }: { className?: string }): React.ReactElement {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8" stroke="currentColor" strokeWidth="1.8" /><path d="m15.2 15.2 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
