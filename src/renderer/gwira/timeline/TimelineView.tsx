import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WorkGraphRecords } from '../graph/graphModel.js';
import {
  ALL, NAME_WIDTH, NO_FILTERS, ROW_HEIGHT, buildLinks, buildRows, buildTimeline, centerDay, clampNameWidth, dayOfDate, describeTask, formatDay, linkPath, returnTarget, scrollForCenter, timelineRange, timelineTicks,
  type TimelineFilters, type TimelineLink, type TimelineGroupBy, type TimelineRow, type TimelineTask, type TimelineZoom
} from './timelineModel.js';
import { TimelineTooltip, type TooltipHandle } from './TimelineTooltip.js';
import './timeline.css';

/** Windowing starts only above this many rows. Measured: 1,600 tasks rendered in full took about 1.7 s per zoom change. */
const VIRTUALIZE_ABOVE = 150;
const OVERSCAN = 16;
const WINDOW_BLOCK = 8;
const PREFS_KEY = 'gwira.timeline.prefs.v1';
const ZOOMS: Array<{ id: TimelineZoom; label: string; step: number }> = [{ id: 'day', label: 'Day', step: 7 }, { id: 'week', label: 'Week', step: 28 }, { id: 'month', label: 'Month', step: 91 }];
const GROUPS: Array<{ id: TimelineGroupBy; label: string }> = [{ id: 'none', label: 'None' }, { id: 'objective', label: 'Objective' }, { id: 'owner', label: 'Owner' }, { id: 'project', label: 'Project' }];

interface Prefs { zoom: TimelineZoom; groupBy: TimelineGroupBy; filters: TimelineFilters; collapsed: string[]; nameWidth: number }

function readPrefs(): Prefs {
  const fallback: Prefs = { zoom: 'week', groupBy: 'objective', filters: NO_FILTERS, collapsed: [], nameWidth: NAME_WIDTH.initial };
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    const filter = (entry: unknown): string => typeof entry === 'string' ? entry : ALL;
    return {
      zoom: ZOOMS.some((zoom) => zoom.id === value.zoom) ? value.zoom as TimelineZoom : fallback.zoom,
      groupBy: GROUPS.some((group) => group.id === value.groupBy) ? value.groupBy as TimelineGroupBy : fallback.groupBy,
      filters: { status: filter(value.filters?.status), owner: filter(value.filters?.owner), project: filter(value.filters?.project) },
      collapsed: Array.isArray(value.collapsed) ? value.collapsed.filter((id): id is string => typeof id === 'string') : [],
      nameWidth: typeof value.nameWidth === 'number' ? clampNameWidth(value.nameWidth) : fallback.nameWidth
    };
  } catch { return fallback; }
}

function initials(name: string): string { return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'; }

export function TimelineView({ records, sourceLabel, selectedTaskId, onSelectTask, onHideInspector }: {
  /** Collapses the shared inspector to give the schedule more room. Shown only in narrow panes. */
  onHideInspector?: () => void;
  records: WorkGraphRecords;
  /** Set when the records are a development fixture or demo rather than the workspace. */
  sourceLabel?: string;
  selectedTaskId?: string;
  onSelectTask: (taskId: string) => void;
}): React.ReactElement {
  const [prefs, setPrefs] = useState(readPrefs);
  const [filterOpen, setFilterOpen] = useState(false);
  const [visibleLabel, setVisibleLabel] = useState('');
  const [returnDay, setReturnDay] = useState<number | undefined>();
  const [win, setWin] = useState({ first: 0, last: 60 });
  const pendingFocus = useRef<number | undefined>(undefined);
  const [selectedLinkId, setSelectedLinkId] = useState<string | undefined>();
  const [liveNameWidth, setLiveNameWidth] = useState<number | undefined>();
  const scroller = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tooltip = useRef<TooltipHandle>(null);
  const anchorDay = useRef<number | undefined>(undefined);
  const leftDay = useRef<number | undefined>(undefined);
  const initialized = useRef(false);
  const frame = useRef(0);
  const today = dayOfDate(new Date());
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* preferences stay in memory */ } }, [prefs]);

  const model = useMemo(() => buildTimeline(records, { today, groupBy: prefs.groupBy, filters: prefs.filters }), [records, today, prefs.groupBy, prefs.filters]);
  const range = useMemo(() => timelineRange(prefs.zoom, today, model.firstDay, model.lastDay), [prefs.zoom, today, model.firstDay, model.lastDay]);
  const { upper, lower } = useMemo(() => timelineTicks(range, prefs.zoom, today), [range, prefs.zoom, today]);
  const effectiveGroup: TimelineGroupBy = prefs.groupBy === 'objective' && !model.canGroupByObjective ? 'none' : prefs.groupBy === 'project' && !model.canGroupByProject ? 'none' : prefs.groupBy;
  const rows = useMemo(() => buildRows(model, effectiveGroup !== 'none', prefs.collapsed), [model, effectiveGroup, prefs.collapsed]);
  const virtual = rows.length > VIRTUALIZE_ABOVE;
  const firstVisible = virtual ? Math.min(win.first, Math.max(0, rows.length - 1)) : 0;
  const lastVisible = virtual ? Math.min(win.last, rows.length - 1) : rows.length - 1;
  const gridDays = prefs.zoom === 'day' ? 1 : 7;
  const gridPx = gridDays * range.pxPerDay;
  const dateWidth = range.days * range.pxPerDay;
  const x = (day: number): number => (day - range.start) * range.pxPerDay;
  const activeFilters = Object.values(prefs.filters).filter((value) => value !== ALL).length;
  const nameWidthPref = liveNameWidth ?? prefs.nameWidth;

  const nameWidth = (): number => scroller.current?.querySelector<HTMLElement>('.gwira-timeline__corner')?.offsetWidth ?? 0;
  const empty = model.total === 0;
  const noMatches = !empty && model.shown === 0;
  const hasGrid = !empty && !noMatches;

  const updateView = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const visibleDays = (element.clientWidth - nameWidth()) / range.pxPerDay;
    const first = range.start + Math.floor(element.scrollLeft / range.pxPerDay);
    const last = Math.min(range.end, range.start + Math.floor(element.scrollLeft / range.pxPerDay + visibleDays));
    leftDay.current = range.start + element.scrollLeft / range.pxPerDay;
    setVisibleLabel(`${formatDay(first, { month: 'short', day: 'numeric' })} – ${formatDay(last, { month: 'short', day: 'numeric', year: 'numeric' })}`);
    setReturnDay(returnTarget({ first, last }, { first: model.firstDay, last: model.lastDay }));
    const headHeight = element.querySelector<HTMLElement>('.gwira-timeline__body')?.offsetTop ?? 0;
    // Snap to blocks so small scrolls reuse the rendered window instead of re-rendering every row.
    const firstRow = Math.max(0, Math.floor((element.scrollTop - headHeight) / ROW_HEIGHT / WINDOW_BLOCK) * WINDOW_BLOCK - OVERSCAN);
    const lastRow = Math.ceil((element.scrollTop + element.clientHeight - headHeight) / ROW_HEIGHT / WINDOW_BLOCK) * WINDOW_BLOCK + OVERSCAN;
    setWin((current) => current.first === firstRow && current.last === lastRow ? current : { first: firstRow, last: lastRow });
  }, [range, model.firstDay, model.lastDay]);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => { frame.current = 0; updateView(); });
  }, [updateView]);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const scrollToDay = useCallback((day: number, where: number, smooth: boolean) => {
    const element = scroller.current;
    if (!element) return;
    const visible = element.clientWidth - nameWidth();
    element.scrollTo({ left: Math.max(0, x(day) - visible * where), behavior: smooth ? 'smooth' : 'auto' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);
  const scrollToRow = (index: number, center = false): void => {
    const element = scroller.current;
    if (!element) return;
    const head = element.querySelector<HTMLElement>('.gwira-timeline__body')?.offsetTop ?? 0;
    const top = head + index * ROW_HEIGHT;
    if (center) element.scrollTop = Math.max(0, top - element.clientHeight / 2);
    else if (top - head < element.scrollTop) element.scrollTop = top - head;
    else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
  };
  const goToToday = useCallback((smooth: boolean) => scrollToDay(today, 0.3, smooth), [scrollToDay, today]);

  // Keep the same moment in view when zoom or the date range changes; start at today the first time.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!hasGrid) { initialized.current = false; return; }
    if (!element) return;
    const visible = element.clientWidth - nameWidth();
    if (anchorDay.current !== undefined) {
      element.scrollLeft = scrollForCenter(anchorDay.current, visible, range);
      anchorDay.current = undefined;
    } else if (initialized.current && leftDay.current !== undefined) element.scrollLeft = Math.max(0, x(leftDay.current));
    else { goToToday(false); initialized.current = true; }
    updateView();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasGrid, range.start, range.pxPerDay]);

  useEffect(() => { updateView(); }, [updateView, rows.length]);
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === undefined) return;
    const element = scroller.current?.querySelector<HTMLElement>(`[data-row-index="${target}"]`);
    if (element) { pendingFocus.current = undefined; element.focus(); }
  }, [win, rows]);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: PointerEvent): void => { if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false); };
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [filterOpen]);

  // Bring a task chosen elsewhere (for example the inspector) into view without changing zoom.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !selectedTaskId) return;
    const selectedIndex = rows.findIndex((row) => row.kind === 'task' && row.task.id === selectedTaskId);
    if (selectedIndex >= 0) scrollToRow(selectedIndex);
    const task = rows.find((row): row is Extract<TimelineRow, { kind: 'task' }> => row.kind === 'task' && row.task.id === selectedTaskId)?.task;
    if (task?.sortDay === undefined) return;
    const visible = element.clientWidth - nameWidth();
    const left = x(task.sortDay);
    if (left < element.scrollLeft || left > element.scrollLeft + visible - 24) scrollToDay(task.sortDay, 0.3, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaskId]);

  const update = (patch: Partial<Prefs>): void => setPrefs((current) => ({ ...current, ...patch }));
  // Keep the filter popover inside both the timeline pane and the window, whatever the pane width.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const root = rootRef.current;
    if (!filterOpen || !popover || !root) return;
    const place = (): void => {
      popover.style.transform = '';
      popover.style.maxHeight = '';
      const box = popover.getBoundingClientRect();
      const bounds = root.getBoundingClientRect();
      const left = Math.max(bounds.left, 0) + 6;
      const right = Math.min(bounds.right, window.innerWidth) - 6;
      const shift = box.left < left ? left - box.left : box.right > right ? right - box.right : 0;
      if (shift) popover.style.transform = `translateX(${Math.round(shift)}px)`;
      popover.style.maxHeight = `${Math.max(120, Math.min(bounds.bottom, window.innerHeight) - box.top - 8)}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [filterOpen, activeFilters, model.shown, prefs.zoom]);
  const setFilter = (key: keyof TimelineFilters, value: string): void => setPrefs((current) => ({ ...current, filters: { ...current.filters, [key]: value } }));
  const changeZoom = (zoom: TimelineZoom): void => {
    const element = scroller.current;
    if (element && zoom !== prefs.zoom) anchorDay.current = centerDay(element.scrollLeft, element.clientWidth - nameWidth(), range);
    update({ zoom });
  };
  const stepZoom = (direction: -1 | 1): void => {
    const index = ZOOMS.findIndex((zoom) => zoom.id === prefs.zoom) + direction;
    if (index >= 0 && index < ZOOMS.length) changeZoom(ZOOMS[index].id);
  };
  const page = (direction: -1 | 1): void => {
    const step = ZOOMS.find((zoom) => zoom.id === prefs.zoom)?.step ?? 7;
    scroller.current?.scrollBy({ left: direction * step * range.pxPerDay, behavior: 'smooth' });
  };
  const toggleGroup = (id: string): void => setPrefs((current) => ({ ...current, collapsed: current.collapsed.includes(id) ? current.collapsed.filter((entry) => entry !== id) : [...current.collapsed, id] }));

  function onScrollerKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 't') goToToday(true);
    else if (event.key === '+' || event.key === '=') stepZoom(-1);
    else if (event.key === '-') stepZoom(1);
    else if (event.key === '[') page(-1);
    else if (event.key === ']') page(1);
    else return;
    event.preventDefault();
  }

  function onRowKeyDown(event: React.KeyboardEvent<HTMLElement>, groupId?: string): void {
    const index = Number(event.currentTarget.dataset.rowIndex);
    const focusable = rows.flatMap((row, position) => row.kind === 'notice' ? [] : [position]);
    const at = focusable.indexOf(index);
    let next = at;
    if (event.key === 'ArrowDown') next = Math.min(focusable.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = focusable.length - 1;
    else if (groupId && event.key === 'ArrowLeft' && !prefs.collapsed.includes(groupId)) { event.preventDefault(); toggleGroup(groupId); return; }
    else if (groupId && event.key === 'ArrowRight' && prefs.collapsed.includes(groupId)) { event.preventDefault(); toggleGroup(groupId); return; }
    else return;
    event.preventDefault();
    const target = focusable[next];
    const node = scroller.current?.querySelector<HTMLElement>(`[data-row-index="${target}"]`);
    if (node) { node.focus(); scrollToRow(target); return; }
    pendingFocus.current = target;
    scrollToRow(target, true);
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const handle = event.currentTarget;
    try { handle.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
    const startX = event.clientX;
    const startWidth = nameWidth() || prefs.nameWidth;
    const move = (next: PointerEvent): void => setLiveNameWidth(clampNameWidth(startWidth + next.clientX - startX));
    const end = (next: PointerEvent): void => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end);
      update({ nameWidth: clampNameWidth(startWidth + next.clientX - startX) });
      setLiveNameWidth(undefined);
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
  }
  function onResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const delta = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    if (delta) update({ nameWidth: clampNameWidth(prefs.nameWidth + delta) });
    else if (event.key === 'Home') update({ nameWidth: NAME_WIDTH.min });
    else if (event.key === 'End') update({ nameWidth: NAME_WIDTH.max });
    else if (event.key === 'Enter') update({ nameWidth: NAME_WIDTH.initial });
    else return;
    event.preventDefault();
  }

  const tipFor = (task: TimelineTask, extra?: string) => {
    const lines = (): string[] => [...describeTask(task).split('\n'), ...(extra ? [extra] : [])];
    return {
      onMouseEnter: (event: React.MouseEvent) => tooltip.current?.show(lines(), event.clientX, event.clientY),
      onMouseMove: (event: React.MouseEvent) => tooltip.current?.show(lines(), event.clientX, event.clientY),
      onMouseLeave: () => tooltip.current?.hide(),
      onFocus: (event: React.FocusEvent<HTMLElement>) => { const box = event.currentTarget.getBoundingClientRect(); tooltip.current?.show(lines(), box.left + 28, box.bottom - 10); },
      onBlur: () => tooltip.current?.hide()
    };
  };

  function markers(task: TimelineTask): React.ReactNode {
    return <>
      {task.plannedStart !== undefined && task.plannedEnd !== undefined ? <span className="gwira-timeline__planned" aria-hidden="true" style={{ left: x(task.plannedStart), width: (task.plannedEnd - task.plannedStart + 1) * range.pxPerDay }} /> : null}
      {task.delivery && task.end !== undefined && task.deadline !== undefined && task.delivery.kind !== 'on-time' ? <span className={`gwira-timeline__delivery is-${task.delivery.kind}`} aria-hidden="true" style={task.delivery.kind === 'late' ? { left: x(task.deadline) + range.pxPerDay / 2, width: (task.end - task.deadline) * range.pxPerDay + range.pxPerDay / 2 } : { left: x(task.end + 1), width: (task.deadline - task.end) * range.pxPerDay - range.pxPerDay / 2 }} /> : null}
      {task.start !== undefined && task.end !== undefined ? <button type="button" tabIndex={-1} className={`gwira-timeline__bar is-${task.status}${task.running ? ' is-running' : ''}${task.ownerKind === 'doat' ? ' is-doat' : ''}`} style={{ left: x(task.start), width: Math.max(6, (task.end - task.start + 1) * range.pxPerDay) }} {...tipFor(task)} aria-label={`${task.title}, run ${formatDay(task.start, { month: 'short', day: 'numeric' })} to ${formatDay(task.end, { month: 'short', day: 'numeric' })}`} onClick={() => onSelectTask(task.id)}>{(task.end - task.start + 1) * range.pxPerDay > 90 ? <span>{task.title}</span> : null}</button> : null}
      {task.deadline !== undefined ? <button type="button" tabIndex={-1} className={`gwira-timeline__marker is-deadline${task.overdue ? ' is-overdue' : ''}${task.status === 'completed' ? ' is-done' : ''}`} style={{ left: x(task.deadline) + range.pxPerDay / 2 }} {...tipFor(task)} aria-label={`${task.title}, due ${formatDay(task.deadline, { month: 'short', day: 'numeric' })}${task.overdue ? ', overdue' : ''}`} onClick={() => onSelectTask(task.id)} /> : null}
      {task.milestones.map((milestone) => <button key={`${milestone.kind}:${milestone.day}`} type="button" tabIndex={-1} className={`gwira-timeline__marker is-${milestone.kind}`} style={{ left: x(milestone.day) + range.pxPerDay / 2 }} {...tipFor(task, `${milestone.label} ${formatDay(milestone.day, { month: 'short', day: 'numeric' })}`)} aria-label={`${task.title}: ${milestone.label} ${formatDay(milestone.day, { month: 'short', day: 'numeric' })}`} onClick={() => onSelectTask(task.id)} />)}
    </>;
  }

  const rowIndex = useMemo(() => new Map(rows.flatMap((row, index) => row.kind === 'task' ? [[row.task.id, index] as const] : [])), [rows]);
  const hasNotice = rows.some((row) => row.kind === 'notice');
  const { links, undrawnCount } = useMemo(() => {
    const all = buildLinks([...model.groups.flatMap((group) => group.tasks), ...model.unscheduled]);
    if (hasNotice) return { links: [] as TimelineLink[], undrawnCount: all.undrawn.length + all.links.length };
    const visible = all.links.filter((link) => rowIndex.has(link.fromId) && rowIndex.has(link.toId));
    return { links: visible, undrawnCount: all.undrawn.length + all.links.length - visible.length };
  }, [hasNotice, model.groups, model.unscheduled, rowIndex]);
  const activeLink = links.find((link) => link.id === selectedLinkId);
  useEffect(() => { if (selectedLinkId && !links.some((link) => link.id === selectedLinkId)) setSelectedLinkId(undefined); }, [links, selectedLinkId]);

  function selectTaskFromLink(taskId: string): void { setSelectedLinkId(undefined); onSelectTask(taskId); }

  function renderLinks(): React.ReactNode {
    if (!links.length) return null;
    const near = virtual ? links.filter((link) => { const a = rowIndex.get(link.fromId) ?? 0; const b = rowIndex.get(link.toId) ?? 0; return Math.max(a, b) >= firstVisible && Math.min(a, b) <= lastVisible; }) : links;
    const point = (anchor: TimelineLink['from']): number => x(anchor.pos - (anchor.point ? 0.5 : 0)) + (anchor.point ? range.pxPerDay / 2 : 0);
    return <svg className="gwira-timeline__links" aria-label="Recorded dependencies" role="group" width={dateWidth} height={rows.length * ROW_HEIGHT} style={{ left: 'var(--timeline-name-width)' }}>
      <defs>
        <marker id="gwira-link-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6z" fill="currentColor" /></marker>
      </defs>
      {near.map((link) => {
        const fromRow = rowIndex.get(link.fromId) ?? 0;
        const toRow = rowIndex.get(link.toId) ?? 0;
        const d = linkPath(point(link.from), fromRow * ROW_HEIGHT + ROW_HEIGHT / 2, point(link.to), toRow * ROW_HEIGHT + ROW_HEIGHT / 2);
        const related = link.fromId === selectedTaskId || link.toId === selectedTaskId;
        const active = link.id === selectedLinkId;
        const label = `${link.toTitle} depends on ${link.fromTitle}${link.state === 'conflict' ? ', possible scheduling overlap' : ''}`;
        const choose = (): void => setSelectedLinkId(active ? undefined : link.id);
        return <g key={link.id} className={`gwira-timeline__link is-${link.state}${related ? ' is-related' : ''}${active ? ' is-active' : ''}`} data-link-id={link.id} role="button" tabIndex={0} aria-label={label} aria-pressed={active} onClick={choose} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } }}>
          <path className="gwira-timeline__link-hit" d={d} />
          <path className="gwira-timeline__link-line" d={d} markerEnd="url(#gwira-link-arrow)" />
        </g>;
      })}
    </svg>;
  }

  const cellStyle: React.CSSProperties = { width: dateWidth, backgroundSize: `${gridPx}px 100%` };

  function renderRow(entry: { row: TimelineRow; index: number }): React.ReactNode {
    const { row } = entry;
    if (row.kind === 'notice') return <div key={row.key} className="gwira-timeline__notice" role="row"><div role="gridcell">{row.text}</div></div>;
    if (row.kind === 'group') {
      const { group, collapsed } = row;
      return <div key={row.key} className="gwira-timeline__row is-group" role="row">
        <div className="gwira-timeline__name" role="rowheader"><button type="button" data-timeline-row data-row-index={entry.index} aria-expanded={!collapsed} onClick={() => toggleGroup(group.id)} onKeyDown={(event) => onRowKeyDown(event, group.id)}><span className={`gwira-timeline__chevron${collapsed ? '' : ' is-open'}`} aria-hidden="true">›</span><span className="gwira-timeline__title">{group.label}</span><span className="gwira-timeline__count">{group.tasks.length}</span>{group.occupancy && group.occupancy.peak > 1 ? <span className="gwira-timeline__parallel">{`×${group.occupancy.peak} at once`}</span> : null}</button></div>
        <div className="gwira-timeline__cells" role="gridcell" style={cellStyle}>{group.occupancy?.segments.map((segment) => <span key={segment.start} className={`gwira-timeline__load is-${Math.min(segment.count, 3)}`} aria-hidden="true" style={{ left: x(segment.start), width: (segment.end - segment.start + 1) * range.pxPerDay }} {...(segment.count > 1 ? { onMouseEnter: (event: React.MouseEvent<HTMLElement>) => tooltip.current?.show([`${segment.count} recorded runs overlap`, `${formatDay(segment.start, { month: 'short', day: 'numeric' })} to ${formatDay(segment.end, { month: 'short', day: 'numeric' })}`], event.clientX + 12, event.clientY + 14), onMouseLeave: () => tooltip.current?.hide() } : {})}>{segment.count > 1 && (segment.end - segment.start + 1) * range.pxPerDay > 16 ? segment.count : null}</span>)}</div>
      </div>;
    }
    if (row.kind === 'unscheduled') {
      return <div key={row.key} className="gwira-timeline__row is-group is-unscheduled" role="row">
        <div className="gwira-timeline__name" role="rowheader"><button type="button" data-timeline-row data-row-index={entry.index} aria-expanded={!row.collapsed} onClick={() => toggleGroup('unscheduled')} onKeyDown={(event) => onRowKeyDown(event, 'unscheduled')}><span className={`gwira-timeline__chevron${row.collapsed ? '' : ' is-open'}`} aria-hidden="true">›</span><span className="gwira-timeline__title">Unscheduled</span><span className="gwira-timeline__count">{row.count}</span></button></div>
        <div className="gwira-timeline__cells" role="gridcell" style={cellStyle}><span className="gwira-timeline__undated">Work without a recorded date</span></div>
      </div>;
    }
    const { task } = row;
    const selected = task.id === selectedTaskId;
    return <div key={row.key} className={`gwira-timeline__row${selected ? ' is-selected' : ''}`} role="row" aria-selected={selected}>
      <div className="gwira-timeline__name" role="rowheader">
        <button type="button" data-timeline-row data-row-index={entry.index} data-task-id={task.id} aria-current={selected ? 'true' : undefined} {...tipFor(task)} onClick={() => onSelectTask(task.id)} onKeyDown={onRowKeyDown}>
          <span className={`gwira-timeline__owner is-${task.ownerKind}`} aria-label={task.ownerKind === 'doat' ? `Doat ${task.ownerName}` : task.ownerKind === 'person' ? `Person ${task.ownerName}` : 'Unassigned'}>
            {initials(task.ownerName)}
          </span>
          <span className="gwira-timeline__title">{task.title}</span>
          <span className={`gwira-timeline__status is-${task.status}`}><i aria-hidden="true" /><em>{task.statusLabel}</em></span>
        </button>
      </div>
      <div className="gwira-timeline__cells" role="gridcell" style={cellStyle}>{task.scheduled ? markers(task) : <span className="gwira-timeline__undated">No dates recorded</span>}</div>
    </div>;
  }

  // Horizontal scrolling re-renders this component for the date label; the rows and links only change with these inputs.
  /* eslint-disable react-hooks/exhaustive-deps */
  const renderedRows = useMemo(() => rows.slice(firstVisible, lastVisible + 1).map((row, offset) => renderRow({ row, index: firstVisible + offset })),
    [rows, firstVisible, lastVisible, range, selectedTaskId, prefs.collapsed, onSelectTask, dateWidth]);
  const renderedLinks = useMemo(() => renderLinks(), [links, rowIndex, firstVisible, lastVisible, virtual, selectedTaskId, selectedLinkId, range, dateWidth, rows.length]);
  /* eslint-enable react-hooks/exhaustive-deps */

  return <div className="gwira-timeline" ref={rootRef} role="region" aria-label="Timeline" data-timeline-zoom={prefs.zoom} style={{ '--timeline-name-pref': `${nameWidthPref}px`, '--timeline-row': `${ROW_HEIGHT}px` } as React.CSSProperties}>
    <div className="gwira-timeline__toolbar" role="toolbar" aria-label="Timeline controls">
      <h2>Timeline</h2>
      {sourceLabel ? <span className="gwira-timeline__source" title="Development data. Nothing here is stored in your workspace.">{sourceLabel}</span> : null}
      <div className="gwira-timeline__navigation">
        <button type="button" onClick={() => goToToday(true)}>Today</button>
        <button type="button" aria-label="Previous dates" onClick={() => page(-1)}>‹</button>
        <button type="button" aria-label="Next dates" onClick={() => page(1)}>›</button>
        <output aria-live="polite">{visibleLabel}</output>
        {returnDay !== undefined ? <button type="button" className="gwira-timeline__return" onClick={() => scrollToDay(returnDay, 0.15, true)}>{returnDay > range.start + (scroller.current?.scrollLeft ?? 0) / range.pxPerDay ? 'Back to tasks →' : '← Back to tasks'}</button> : null}
      </div>
      <div className="gwira-timeline__spacer" />
      {onHideInspector ? <button type="button" className="gwira-timeline__hide-inspector" data-testid="timeline-hide-inspector" onClick={onHideInspector} title="Hide the details panel to give the timeline more room">Hide details</button> : null}
      <div className="gwira-timeline__zoom" role="group" aria-label="Timeline zoom">
        {ZOOMS.map((zoom) => <button key={zoom.id} type="button" aria-pressed={prefs.zoom === zoom.id} onClick={() => changeZoom(zoom.id)}>{zoom.label}</button>)}
      </div>
      <div className="gwira-timeline__filter" ref={filterRef}>
        <button type="button" aria-expanded={filterOpen} aria-haspopup="dialog" onClick={() => setFilterOpen((open) => !open)}>Filter{activeFilters ? <b>{activeFilters}</b> : null}</button>
        {filterOpen ? <div className="gwira-timeline__popover" ref={popoverRef} role="dialog" aria-label="Filter timeline">
          <label>Status<select value={prefs.filters.status} onChange={(event) => setFilter('status', event.target.value)}><option value={ALL}>All statuses</option>{model.statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label>Owner<select value={prefs.filters.owner} onChange={(event) => setFilter('owner', event.target.value)}><option value={ALL}>All owners</option>{model.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}</select></label>
          <label>Project<select value={prefs.filters.project} disabled={!model.projects.length} onChange={(event) => setFilter('project', event.target.value)}><option value={ALL}>{model.projects.length ? 'All projects' : 'No projects recorded'}</option>{model.projects.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}</select></label>
          <button type="button" disabled={!activeFilters} onClick={() => update({ filters: NO_FILTERS })}>Clear filters</button>
        </div> : null}
      </div>
      <label className="gwira-timeline__group"><span>Group</span>
        <select aria-label="Group by" value={effectiveGroup} onChange={(event) => update({ groupBy: event.target.value as TimelineGroupBy })}>
          {GROUPS.map((group) => <option key={group.id} value={group.id} disabled={(group.id === 'objective' && !model.canGroupByObjective) || (group.id === 'project' && !model.canGroupByProject)}>{group.label}</option>)}
        </select>
      </label>
    </div>

    {activeFilters ? <div className="gwira-timeline__filters" role="status" data-testid="timeline-filter-strip">
      <span className="gwira-timeline__count">Showing {model.shown} of {model.total} tasks</span>
      {(Object.keys(prefs.filters) as Array<keyof TimelineFilters>).filter((key) => prefs.filters[key] !== ALL).map((key) => {
        const value = prefs.filters[key];
        const label = key === 'status' ? model.statuses.find((entry) => entry.id === value)?.label : key === 'owner' ? model.owners.find((entry) => entry.id === value)?.label : model.projects.find((entry) => entry.id === value)?.label;
        return <button key={key} type="button" className="gwira-timeline__chip" aria-label={`Remove ${key} filter: ${label ?? value}`} onClick={() => setFilter(key, ALL)}>{key}: {label ?? 'Unavailable'} <span aria-hidden="true">×</span></button>;
      })}
      <button type="button" className="gwira-timeline__clear" onClick={() => update({ filters: NO_FILTERS })}>Clear all</button>
      {model.hiddenAttention ? <span className="gwira-timeline__hidden-warning" data-testid="timeline-hidden-attention">{model.hiddenAttention} hidden {model.hiddenAttention === 1 ? 'task needs' : 'tasks need'} attention (overdue, waiting, blocked or failed)</span> : null}
    </div> : null}

    {empty ? <div className="gwira-timeline__empty"><strong>No work to schedule yet</strong><span>Work items with due dates, recorded runs or approvals appear here. Add work from the Workflow view or with Add work.</span></div>
      : noMatches ? <div className="gwira-timeline__empty"><strong>No tasks match these filters</strong><button type="button" onClick={() => update({ filters: NO_FILTERS })}>Clear filters</button></div>
      : <div className="gwira-timeline__scroller" ref={scroller} onScroll={onScroll} onKeyDown={onScrollerKeyDown} tabIndex={0} aria-label="Timeline schedule. Press T for today, plus or minus to zoom.">
        <div className="gwira-timeline__canvas" role="grid" aria-label="Scheduled work" aria-rowcount={rows.length} style={{ width: `calc(var(--timeline-name-width) + ${dateWidth}px)` }}>
          <div className="gwira-timeline__head">
            <div className="gwira-timeline__corner" role="columnheader">
              Task
              <div className="gwira-timeline__resizer" role="separator" aria-orientation="vertical" aria-label="Resize task column" aria-valuemin={NAME_WIDTH.min} aria-valuemax={NAME_WIDTH.max} aria-valuenow={nameWidthPref} tabIndex={0} onPointerDown={startResize} onKeyDown={onResizeKeyDown} onDoubleClick={() => update({ nameWidth: NAME_WIDTH.initial })} />
            </div>
            <div className="gwira-timeline__dates" style={{ width: dateWidth }}>
              <div className="gwira-timeline__tier">{upper.map((tick) => <span key={tick.start} style={{ left: x(tick.start), width: tick.span * range.pxPerDay }}><b>{tick.label}</b></span>)}</div>
              <div className="gwira-timeline__tier is-lower">{lower.map((tick) => <span key={tick.start} className={`${tick.weekend ? 'is-weekend ' : ''}${tick.today ? 'is-today' : ''}`} style={{ left: x(tick.start), width: tick.span * range.pxPerDay }}>{tick.label}{tick.sub ? <small>{tick.sub}</small> : null}</span>)}</div>
            </div>
          </div>
          <div className="gwira-timeline__body">
            <div className="gwira-timeline__today" aria-hidden="true" style={{ left: `calc(var(--timeline-name-width) + ${x(today) + range.pxPerDay / 2}px)` }} />
            {firstVisible > 0 ? <div className="gwira-timeline__spacer-row" aria-hidden="true" style={{ height: firstVisible * ROW_HEIGHT }} /> : null}
            {renderedRows}
            {lastVisible < rows.length - 1 ? <div className="gwira-timeline__spacer-row" aria-hidden="true" style={{ height: (rows.length - 1 - lastVisible) * ROW_HEIGHT }} /> : null}
            {renderedLinks}
          </div>
        </div>
      </div>}
    {activeLink ? <section className={`gwira-timeline__dependency${activeLink.state === 'conflict' ? ' is-conflict' : ''}`} aria-label="Selected dependency">
      <div><strong>{activeLink.toTitle}</strong> waits for <strong>{activeLink.fromTitle}</strong></div>
      <div className="gwira-timeline__dependency-dates">{`${formatDay(activeLink.from.day, { month: 'short', day: 'numeric' })} ${activeLink.from.point ? '(date marker)' : 'finish'} → ${formatDay(activeLink.to.day, { month: 'short', day: 'numeric' })} ${activeLink.to.point ? '(date marker)' : 'start'}`}</div>
      {activeLink.state === 'conflict' ? <div className="gwira-timeline__dependency-warning" role="status">Possible scheduling overlap: the dependent starts before its predecessor finishes. The dependency type is not recorded, so this may be intended parallel work.</div> : null}
      <div className="gwira-timeline__dependency-note">Recorded dependency. Dates are not rescheduled automatically.</div>
      <div className="gwira-timeline__dependency-actions">
        <button type="button" onClick={() => selectTaskFromLink(activeLink.fromId)}>Select predecessor</button>
        <button type="button" onClick={() => selectTaskFromLink(activeLink.toId)}>Select dependent</button>
        <button type="button" onClick={() => setSelectedLinkId(undefined)}>Close</button>
      </div>
    </section> : null}
    <footer className="gwira-timeline__legend" aria-label="Legend">
      <span><i className="is-bar" />Recorded run</span><span><i className="is-planned" />Planned</span><span><i className="is-deadline" />Due date</span>{links.length || undrawnCount ? <span data-testid="timeline-legend-dependencies"><i className="is-link" />{links.length ? 'Dependency' : 'Dependencies'}{undrawnCount ? ` (${undrawnCount} not drawn: hidden or no recorded date)` : ''}</span> : null}<span><i className="is-approval" />Approval</span><span><i className="is-overdue" />Overdue</span><span className="is-today"><i />Today</span><span className="gwira-timeline__legend-note">Dates are read-only.</span>
    </footer>
    <TimelineTooltip ref={tooltip} />
  </div>;
}
