import { Icon } from "../../components/Icon.js";
import React from 'react';
import { ALL, WORK_FILTER_KEYS, activeFilterCount, filterValueLabel, type FilterOptions, type WorkFilterKey, type WorkFilters } from './workFilters.js';
import './workFilters.css';

interface WorkFilterStripProps {
  filters: WorkFilters;
  options: FilterOptions;
  shown: number;
  total: number;
  /** Tasks hidden by the filters that still need attention. */
  hiddenAttention: number;
  /** Plain-language criteria for hiddenAttention, owned by the calling view. */
  attentionCriteria: string;
  onChange: (key: WorkFilterKey, value: string) => void;
  onClear: () => void;
  testId?: string;
  attentionTestId?: string;
}

/** Shows what is filtering the work: count, removable chips, clear-all, and any hidden work that needs attention. */
export function WorkFilterStrip({ filters, options, shown, total, hiddenAttention, attentionCriteria, onChange, onClear, testId, attentionTestId }: WorkFilterStripProps): React.ReactElement | null {
  const activeCount = activeFilterCount(filters);
  if (!activeCount && !hiddenAttention) return null;
  return <div className="gwira-work-filters" role="status" data-testid={testId}>
    <span className="gwira-work-filters__count">Showing {shown} of {total} tasks</span>
    {WORK_FILTER_KEYS.filter((key) => filters[key] !== ALL).map((key) => {
      const value = filters[key];
      const label = filterValueLabel(key, value, options);
      return <button key={key} type="button" className="gwira-work-filters__chip" aria-label={`Remove ${key} filter: ${label ?? 'Unavailable'}`} onClick={() => onChange(key, ALL)}><span className="gwira-work-filters__label">{key}: {label ?? 'Unavailable'}</span><span aria-hidden="true"><Icon name="close" /></span></button>;
    })}
    {activeCount ? <button type="button" className="gwira-work-filters__clear" onClick={onClear}>Clear all</button> : null}
    {hiddenAttention ? <span className="gwira-work-filters__warning" data-testid={attentionTestId}>{hiddenAttention} hidden {hiddenAttention === 1 ? 'task needs' : 'tasks need'}{` attention (${attentionCriteria})`}</span> : null}
  </div>;
}
