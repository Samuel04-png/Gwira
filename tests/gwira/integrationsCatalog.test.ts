import { describe, expect, it } from 'vitest';
import { INTEGRATION_CATALOG, LOCAL_PROTOTYPE_CONNECTOR_NOTICE, catalogByCategory, connectorStatus, localPrototypeAuthorizationError } from '../../src/renderer/gwira/integrations/domain/catalog.js';
import type { ConnectorCatalogItem } from '../../src/renderer/gwira/integrations/domain/types.js';

describe('integration catalog contracts', () => {
  it('lists requested business categories without representing an unimplemented connector as available', () => {
    expect(INTEGRATION_CATALOG.map((item) => item.category)).toEqual(expect.arrayContaining(['communication', 'development', 'productivity', 'business', 'payments']));
    expect(INTEGRATION_CATALOG.every((item) => item.availability === 'unavailable')).toBe(true);
    expect(INTEGRATION_CATALOG.every((item) => item.availabilityMessage === LOCAL_PROTOTYPE_CONNECTOR_NOTICE)).toBe(true);
  });

  it('keeps a provider unavailable even if stale connection metadata claims it is connected', () => {
    const github = INTEGRATION_CATALOG.find((item) => item.id === 'github')!;
    expect(connectorStatus(github, { id: 'connection', organizationId: 'org', connectorId: github.id, status: 'connected', grantedScopeIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })).toBe('unavailable');
  });

  it('groups catalog records predictably without mutating the catalog', () => {
    const snapshot = [...INTEGRATION_CATALOG];
    const groups = catalogByCategory();
    expect(groups.get('communication')?.map((item) => item.id)).toContain('discord');
    expect([...INTEGRATION_CATALOG]).toEqual(snapshot);
  });

  it('returns an explicit no-network authorization failure instead of beginning OAuth', () => {
    expect(localPrototypeAuthorizationError({ connectorId: 'discord', organizationId: 'org', requestedScopeIds: ['messages.send'] })).toMatchObject({ code: 'unsupported_in_local_prototype', retryable: false, message: LOCAL_PROTOTYPE_CONNECTOR_NOTICE });
  });

  it('does not turn a planned catalog item into a connection status', () => {
    const planned: ConnectorCatalogItem = { ...INTEGRATION_CATALOG[0], availability: 'planned' };
    expect(connectorStatus(planned)).toBe('not_connected');
  });
});
