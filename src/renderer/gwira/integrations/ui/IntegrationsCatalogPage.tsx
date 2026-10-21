import React from 'react';
import { INTEGRATION_CATEGORY_LABELS, LOCAL_PROTOTYPE_CONNECTOR_NOTICE, catalogByCategory, connectorStatus } from '../domain/catalog.js';
import type { ConnectorCatalogItem, ConnectorConnection, IntegrationCategory } from '../domain/types.js';

export interface IntegrationsCatalogPageProps {
  catalog: readonly ConnectorCatalogItem[];
  connections?: readonly ConnectorConnection[];
}

/**
 * A presentation-only marketplace. It purposely offers no connect action until
 * an organization-scoped, backend-owned authorization flow is available.
 */
export function IntegrationsCatalogPage({ catalog, connections = [] }: IntegrationsCatalogPageProps): React.ReactElement {
  const grouped = catalogByCategory(catalog);
  return <section className="gwira-integrations-page" aria-label="Integrations">
    <header className="gwira-workspace-page__header"><div><h1>Integrations</h1><p>Connect the business tools your organization uses.</p></div></header>
    <p className="gwira-workspace-page__notice" role="status">{LOCAL_PROTOTYPE_CONNECTOR_NOTICE}</p>
    {[...grouped.entries()].map(([category, items]) => <IntegrationCategorySection key={category} category={category} items={items} connections={connections} />)}
  </section>;
}

function IntegrationCategorySection({ category, items, connections }: { category: IntegrationCategory; items: readonly ConnectorCatalogItem[]; connections: readonly ConnectorConnection[] }): React.ReactElement | null {
  if (!items.length) return null;
  return <section className="gwira-integrations-page__category" aria-label={INTEGRATION_CATEGORY_LABELS[category]}>
    <h2>{INTEGRATION_CATEGORY_LABELS[category]}</h2>
    <ul className="gwira-integrations-page__catalog">{items.map((item) => {
      const status = connectorStatus(item, connections.find((connection) => connection.connectorId === item.id));
      return <li key={item.id}><article><h3>{item.name}</h3><p>{item.description}</p><p><strong>Status:</strong> {status === 'unavailable' ? 'Planned — unavailable' : status}</p><details><summary>Planned access</summary><ul>{item.requestedScopes.map((scope) => <li key={scope.id}>{scope.label} ({scope.access}) — {scope.description}</li>)}</ul></details><p>{item.availabilityMessage}</p></article></li>;
    })}</ul>
  </section>;
}
