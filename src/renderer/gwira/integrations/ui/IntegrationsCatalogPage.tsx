import React,{useState} from 'react';
import {Icon} from '../../../components/Icon.js';
import { INTEGRATION_CATEGORY_LABELS, LOCAL_PROTOTYPE_CONNECTOR_NOTICE, catalogByCategory, connectorStatus } from '../domain/catalog.js';
import type { ConnectorCatalogItem, ConnectorConnection, IntegrationCategory } from '../domain/types.js';
import { IntegrationLogo } from './IntegrationLogo.js';

export interface IntegrationsCatalogPageProps {
  catalog: readonly ConnectorCatalogItem[];
  connections?: readonly ConnectorConnection[];
  dataUnavailable?: boolean;
}

/**
 * A presentation-only marketplace. It purposely offers no connect action until
 * an organization-scoped, backend-owned authorization flow is available.
 */
export function IntegrationsCatalogPage({ catalog, connections = [],dataUnavailable=false }: IntegrationsCatalogPageProps): React.ReactElement {
  const [query,setQuery]=useState('');
  const grouped = catalogByCategory(catalog.filter(item=>`${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase())));
  return <section className="gwira-integrations-page" aria-label="Integrations">
    <header className="gwira-workspace-page__header"><div><h1>Integrations</h1><p>{dataUnavailable?'Integration connections are not available in authenticated workspaces.':'Connect the business tools your organization uses.'}</p></div></header>
    <label className="desktop-directory-search">Search integrations<input type="search" placeholder="Find an integration…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{!grouped.size?<p>No integrations match this search.</p>:null}
    {[...grouped.entries()].map(([category, items]) => <IntegrationCategorySection key={category} category={category} items={items} connections={connections} dataUnavailable={dataUnavailable} />)}
  </section>;
}

function IntegrationCategorySection({ category, items, connections,dataUnavailable }: { category: IntegrationCategory; items: readonly ConnectorCatalogItem[]; connections: readonly ConnectorConnection[];dataUnavailable:boolean }): React.ReactElement | null {
  if (!items.length) return null;
  return <section className="gwira-integrations-page__category" aria-label={INTEGRATION_CATEGORY_LABELS[category]}>
    <h2>{INTEGRATION_CATEGORY_LABELS[category]}</h2>
    <ul className="gwira-integrations-page__catalog">{items.map((item) => {
      const status = connectorStatus(item, connections.find((connection) => connection.connectorId === item.id));
      return <li key={item.id}><article><h3><IntegrationLogo integrationId={item.id} name={item.name}/><span>{item.name}<small>{INTEGRATION_CATEGORY_LABELS[item.category]}</small></span></h3><p>{item.description}</p><p><strong>Status:</strong> {dataUnavailable?'Unavailable':status === 'unavailable' ? 'Not connected' : status}</p><details><summary>Planned access</summary><ul>{item.requestedScopes.map((scope) => <li key={scope.id}>{scope.label} ({scope.access}) — {scope.description}</li>)}</ul></details><button type="button" disabled title={`${LOCAL_PROTOTYPE_CONNECTOR_NOTICE} ${item.availabilityMessage}`}>Connect</button></article></li>;
    })}</ul>
  </section>;
}
