// The tools the REMOTE Kiwi connector (/api/agent/mcp) exposes. Each one maps
// to exactly one bounded handler of the private agent gateway — query.js for
// reads, action.js for the three audited writes — and to exactly one scope.
// tools/list only shows the tools the caller's key actually holds, so a
// read-only connection never even sees a write tool.
//
// tools/kiwi-agent-mcp/server.js (the local stdio client) carries the same
// list; tools/agent-mcp-remote-test.mjs fails if the two drift apart.
const str = description => ({ type: 'string', description });
const range = { from: str('First day, YYYY-MM-DD (UTC)'), to: str('Last day, YYYY-MM-DD (UTC). At most 31 days after from.') };
const page = { offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } };
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const tool = (name, scope, title, description, properties = {}, required = [], annotations = READ) => ({
  name, scope, write: annotations === WRITE,
  definition: { name, title, description, inputSchema: { type: 'object', properties, required, additionalProperties: false },
    annotations: { title, ...annotations } },
});

export const TOOLS = [
  tool('merchant_overview', 'overview:read', 'Store profile',
    'The connected store: name, trade, plan and status. No staff codes or raw configuration.'),
  tool('sales_summary', 'sales:read', 'Daily sales by payment method',
    'Non-voided sales per UTC day and payment method (count and amount in centimes, MAD), up to 31 days per call. Best source for revenue charts.',
    range, ['from', 'to']),
  tool('payment_events', 'payments:read', 'Individual payments',
    'Individual sale postings, newest first, including voided ones with their reason. Amounts in centimes (MAD). Paged, 25 per call.',
    { ...range, ...page }, ['from', 'to']),
  tool('refund_events', 'payments:read', 'Refunds',
    'Refund reservations and their settlement status. Read-only: cannot issue a refund.',
    { ...range, ...page }, ['from', 'to']),
  tool('orders_list', 'orders:read', 'Orders',
    'Orders with item lines and status, without customer contact details. Paged, 25 per call.',
    { ...range, ...page }, ['from', 'to']),
  tool('order_detail', 'orders:read', 'One order',
    'One order by exact id, with its lines and payment or cancellation state.',
    { id: str('Exact order id') }, ['id']),
  tool('catalog_search', 'catalog:read', 'Search the catalogue',
    'Find up to 25 products by name (price in MAD). No full catalogue dump.',
    { query: str('At least 2 characters'), limit: page.limit }, ['query']),
  tool('table_sessions', 'tables:read', 'Table sessions',
    'Restaurant table sessions and their order counts, without guest session tokens. Paged.',
    { ...range, ...page }, ['from', 'to']),
  tool('active_tables', 'tables:read', 'Open tables',
    'Tables open right now and how many orders each holds.', page),
  tool('cash_events', 'cash:read', 'Cash drawer events',
    'Drawer openings, cash movements, handovers and closings with counted vs expected amounts (centimes). Paged.',
    { ...range, ...page }, ['from', 'to']),
  tool('hotel_stays', 'hotel:read', 'Hotel stays',
    'Up to 25 stays overlapping a date range. Includes guest names: personal data.',
    { ...range, limit: page.limit }, ['from', 'to']),
  tool('clients_search', 'clients:read', 'Search customers',
    'Up to 25 customer records by name, phone or email. Personal data.',
    { query: str('At least 2 characters'), limit: page.limit }, ['query']),
  tool('operations_notes', 'operations:read', 'Operations notes',
    'Operational notes written for this store. Paged.', { ...range, ...page }, ['from', 'to']),
  tool('operations_tasks', 'operations:read', 'Operations tasks',
    'Operational tasks, their status and assignee. Paged.', { ...range, ...page }, ['from', 'to']),
  tool('create_client', 'clients:create', 'Create a customer',
    'Create a minimal customer record. Pass a stable requestId (16-100 chars) and reuse it on retry.',
    { requestId: str('Stable 16-100 character idempotency id'), name: str('Customer name'),
      phone: str('Phone (phone or email required)'), email: str('Email (phone or email required)') },
    ['requestId', 'name'], WRITE),
  tool('create_operations_note', 'operations:write', 'Add an operations note',
    'Append an audited note. Cannot change orders, payments or stock. Requires a stable requestId.',
    { requestId: str('Stable 16-100 character idempotency id'), note: str('3-1000 characters') },
    ['requestId', 'note'], WRITE),
  tool('create_task', 'operations:write', 'Create an operations task',
    'Create an audited task for the store team. Requires a stable requestId.',
    { requestId: str('Stable 16-100 character idempotency id'), title: str('3-160 characters'),
      detail: str('Optional, up to 1000 characters'), priority: { type: 'integer', minimum: 1, maximum: 4 } },
    ['requestId', 'title'], WRITE),
];
export const BY_NAME = new Map(TOOLS.map(t => [t.name, t]));
