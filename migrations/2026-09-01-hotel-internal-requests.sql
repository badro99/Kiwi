CREATE TABLE IF NOT EXISTS hotel_internal_requests (
  merchant TEXT NOT NULL,
  id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  cancelled INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  create_key TEXT NOT NULL,
  last_command_key TEXT NOT NULL DEFAULT '',
  requester_id TEXT NOT NULL DEFAULT '',
  requester_name TEXT NOT NULL DEFAULT '',
  review_revision INTEGER NOT NULL DEFAULT 0,
  accepted_revision INTEGER NOT NULL DEFAULT 0,
  fulfilment_method TEXT NOT NULL DEFAULT 'pickup',
  delivery_started_ts INTEGER,
  disputed INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  submitted_ts INTEGER,
  closed_ts INTEGER,
  PRIMARY KEY (merchant, id),
  UNIQUE (merchant, create_key)
);

CREATE TABLE IF NOT EXISTS hotel_internal_request_lines (
  merchant TEXT NOT NULL,
  request_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  conversion_snapshot TEXT NOT NULL,
  qty_requested_base_milli INTEGER NOT NULL,
  qty_requested REAL NOT NULL,
  qty_approved REAL NOT NULL DEFAULT 0,
  qty_prepared REAL NOT NULL DEFAULT 0,
  qty_received REAL NOT NULL DEFAULT 0,
  resolution TEXT NOT NULL DEFAULT 'pending',
  substitute_for TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, request_id, line_no)
);

CREATE TABLE IF NOT EXISTS hotel_internal_request_events (
  merchant TEXT NOT NULL,
  id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  event TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_id TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, id),
  UNIQUE (merchant, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_hotel_requests_unit
  ON hotel_internal_requests (merchant, unit_id, updated_ts);
CREATE INDEX IF NOT EXISTS idx_hotel_request_events
  ON hotel_internal_request_events (merchant, request_id, revision);
