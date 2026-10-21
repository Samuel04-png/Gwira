import type { ConnectorAuthorizationRequest, ConnectorCatalogItem, ConnectorConnection, ConnectorConnectionStatus, IntegrationCategory } from './types.js';

export const LOCAL_PROTOTYPE_CONNECTOR_NOTICE =
  'Integrations are planned for Gwira’s backend-connected release. This local prototype cannot connect accounts, request OAuth access, store credentials, synchronize data, or send messages.';

const unavailable = (item: Omit<ConnectorCatalogItem, 'availability' | 'availabilityMessage'>): ConnectorCatalogItem => ({
  ...item,
  availability: 'unavailable',
  availabilityMessage: LOCAL_PROTOTYPE_CONNECTOR_NOTICE
});

/**
 * Catalog entries are intentionally static until a connector is implemented,
 * security reviewed, and backed by organization-scoped authorization.
 */
export const INTEGRATION_CATALOG: readonly ConnectorCatalogItem[] = [
  unavailable({ id: 'whatsapp-business', name: 'WhatsApp Business', category: 'communication', description: 'Approved business messaging and notifications.', requestedScopes: [{ id: 'messages.read', label: 'Read approved messages', access: 'read', description: 'Read conversations explicitly authorized for this organization.', sensitive: true }, { id: 'messages.send', label: 'Send approved messages', access: 'write', description: 'Send messages only through authorized workflows.', sensitive: true }] }),
  unavailable({ id: 'discord', name: 'Discord', category: 'communication', description: 'Role-scoped team updates and commands.', requestedScopes: [{ id: 'channels.read', label: 'Read authorized channels', access: 'read', description: 'Read only channels selected by an administrator.' }, { id: 'messages.send', label: 'Send approved messages', access: 'write', description: 'Post notifications or replies through approved workflows.' }] }),
  unavailable({ id: 'slack', name: 'Slack', category: 'communication', description: 'Team communication and notifications.', requestedScopes: [{ id: 'channels.read', label: 'Read authorized channels', access: 'read', description: 'Read channels explicitly selected by an administrator.' }, { id: 'messages.send', label: 'Send approved messages', access: 'write', description: 'Post messages through approved workflows.' }] }),
  unavailable({ id: 'email', name: 'Email', category: 'communication', description: 'Approved inbox and outbound business communication.', requestedScopes: [{ id: 'mail.read', label: 'Read authorized mail', access: 'read', description: 'Read mailboxes explicitly selected by an administrator.', sensitive: true }, { id: 'mail.send', label: 'Send approved mail', access: 'write', description: 'Send mail only after required approval.', sensitive: true }] }),
  unavailable({ id: 'microsoft-teams', name: 'Microsoft Teams', category: 'communication', description: 'Team messaging and operational updates.', requestedScopes: [{ id: 'channels.read', label: 'Read authorized channels', access: 'read', description: 'Read selected Teams channels.' }, { id: 'messages.send', label: 'Send approved messages', access: 'write', description: 'Post approved messages.' }] }),
  unavailable({ id: 'github', name: 'GitHub', category: 'development', description: 'Repository-scoped development workflows.', requestedScopes: [{ id: 'repositories.read', label: 'Read selected repositories', access: 'read', description: 'Access only repositories approved for a workflow.' }, { id: 'pull_requests.write', label: 'Create pull requests', access: 'write', description: 'Create changes through an approved workflow.', sensitive: true }] }),
  unavailable({ id: 'gitlab', name: 'GitLab', category: 'development', description: 'Repository-scoped development workflows.', requestedScopes: [{ id: 'projects.read', label: 'Read selected projects', access: 'read', description: 'Access only approved projects.' }, { id: 'merge_requests.write', label: 'Create merge requests', access: 'write', description: 'Create changes through approved workflows.', sensitive: true }] }),
  unavailable({ id: 'coding-environments', name: 'Coding environments', category: 'development', description: 'Authorized remote development environments.', requestedScopes: [{ id: 'workspace.read', label: 'Read approved workspace metadata', access: 'read', description: 'Read metadata for selected workspaces.' }, { id: 'workspace.execute', label: 'Run approved jobs', access: 'write', description: 'Run only isolated, approved jobs.', sensitive: true }] }),
  unavailable({ id: 'google-drive', name: 'Google Drive', category: 'productivity', description: 'Organization-scoped document access.', requestedScopes: [{ id: 'files.read', label: 'Read selected files', access: 'read', description: 'Read files selected by an administrator.' }, { id: 'files.write', label: 'Create approved files', access: 'write', description: 'Create files only through approved workflows.', sensitive: true }] }),
  unavailable({ id: 'google-calendar', name: 'Google Calendar', category: 'productivity', description: 'Calendar visibility and approved scheduling.', requestedScopes: [{ id: 'calendar.read', label: 'Read selected calendars', access: 'read', description: 'Read calendars selected by an administrator.' }, { id: 'calendar.write', label: 'Create approved events', access: 'write', description: 'Create events only after required approval.', sensitive: true }] }),
  unavailable({ id: 'google-sheets', name: 'Google Sheets', category: 'productivity', description: 'Spreadsheet information and approved updates.', requestedScopes: [{ id: 'spreadsheets.read', label: 'Read selected spreadsheets', access: 'read', description: 'Read administrator-selected spreadsheets.' }, { id: 'spreadsheets.write', label: 'Update approved spreadsheets', access: 'write', description: 'Write only through approved workflows.', sensitive: true }] }),
  unavailable({ id: 'microsoft-365', name: 'Microsoft 365', category: 'productivity', description: 'Microsoft business productivity tools.', requestedScopes: [{ id: 'files.read', label: 'Read selected files', access: 'read', description: 'Read approved files.' }, { id: 'calendar.read', label: 'Read selected calendars', access: 'read', description: 'Read approved calendars.' }] }),
  unavailable({ id: 'crm', name: 'CRM platforms', category: 'business', description: 'Customer relationship management systems.', requestedScopes: [{ id: 'customers.read', label: 'Read authorized customer records', access: 'read', description: 'Read only selected records.', sensitive: true }, { id: 'customers.write', label: 'Update approved customer records', access: 'write', description: 'Write only with policy approval.', sensitive: true }] }),
  unavailable({ id: 'accounting', name: 'Accounting systems', category: 'business', description: 'Financial operations and reporting systems.', requestedScopes: [{ id: 'reports.read', label: 'Read approved reports', access: 'read', description: 'Read only approved financial reports.', sensitive: true }, { id: 'transactions.write', label: 'Create approved records', access: 'write', description: 'Create records only with explicit approval.', sensitive: true }] }),
  unavailable({ id: 'ecommerce', name: 'Ecommerce platforms', category: 'business', description: 'Commerce operations and order management.', requestedScopes: [{ id: 'orders.read', label: 'Read authorized orders', access: 'read', description: 'Read order data approved for this organization.', sensitive: true }, { id: 'orders.write', label: 'Update approved orders', access: 'write', description: 'Change orders only through approved workflows.', sensitive: true }] }),
  unavailable({ id: 'customer-support', name: 'Customer-support platforms', category: 'business', description: 'Support tickets and customer service operations.', requestedScopes: [{ id: 'tickets.read', label: 'Read authorized tickets', access: 'read', description: 'Read tickets selected by an administrator.', sensitive: true }, { id: 'tickets.write', label: 'Create approved ticket updates', access: 'write', description: 'Update tickets only through approved workflows.', sensitive: true }] }),
  unavailable({ id: 'payment-service-providers', name: 'Payment service providers', category: 'payments', description: 'Payment reporting and approved payment workflows.', requestedScopes: [{ id: 'payments.read', label: 'Read approved payment records', access: 'read', description: 'Read reconciled payment data.', sensitive: true }, { id: 'payments.write', label: 'Create approved payment actions', access: 'write', description: 'Never enabled without strong backend authorization.', sensitive: true }] }),
  unavailable({ id: 'mobile-money', name: 'Mobile money', category: 'payments', description: 'Mobile payment reporting and approved payment workflows.', requestedScopes: [{ id: 'payments.read', label: 'Read approved payment records', access: 'read', description: 'Read reconciled mobile-money data.', sensitive: true }, { id: 'payments.write', label: 'Create approved payment actions', access: 'write', description: 'Never enabled without strong backend authorization.', sensitive: true }] })
];

export const INTEGRATION_CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  communication: 'Communication', development: 'Development', productivity: 'Productivity', business: 'Business', payments: 'Payments'
};

export function catalogByCategory(catalog: readonly ConnectorCatalogItem[] = INTEGRATION_CATALOG): ReadonlyMap<IntegrationCategory, readonly ConnectorCatalogItem[]> {
  const result = new Map<IntegrationCategory, readonly ConnectorCatalogItem[]>();
  (Object.keys(INTEGRATION_CATEGORY_LABELS) as IntegrationCategory[]).forEach((category) => result.set(category, catalog.filter((item) => item.category === category)));
  return result;
}

export function connectorStatus(item: ConnectorCatalogItem, connection?: ConnectorConnection): ConnectorConnectionStatus {
  if (item.availability === 'unavailable') return 'unavailable';
  return connection?.status ?? 'not_connected';
}

/** Returns an explanatory local-only error instead of attempting authorization. */
export function localPrototypeAuthorizationError(request: ConnectorAuthorizationRequest, catalog: readonly ConnectorCatalogItem[] = INTEGRATION_CATALOG): ConnectorConnection['error'] {
  const connector = catalog.find((item) => item.id === request.connectorId);
  return {
    code: 'unsupported_in_local_prototype',
    message: connector?.availabilityMessage ?? LOCAL_PROTOTYPE_CONNECTOR_NOTICE,
    retryable: false,
    occurredAt: new Date(0).toISOString()
  };
}
