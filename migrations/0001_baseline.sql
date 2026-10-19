-- 0001 · baseline : la base de production telle qu'elle était le 2026-10-19.
--
-- Généré depuis sqlite_master de D1 kiwi-sales (lecture seule), sans y toucher :
-- chaque CREATE est le texte exact que SQLite a gardé, rendu idempotent par
-- IF NOT EXISTS. Appliquée à la production, cette migration ne fait donc RIEN :
-- elle sert à enregistrer le point de départ dans d1_migrations. Appliquée à une
-- base neuve, elle reconstruit la production de ce jour-là.
--
-- Ce fichier ne change plus jamais. Le moindre écart avec schema.sql passe par
-- une NOUVELLE migration numérotée — voir docs/ops/MIGRATIONS.md.
-- 89 tables, 87 index.

CREATE TABLE IF NOT EXISTS account_audit ( id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL DEFAULT '', merchant TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, prev TEXT NOT NULL DEFAULT '', next TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL );
CREATE INDEX IF NOT EXISTS idx_account_audit ON account_audit (account_id, ts);
CREATE INDEX IF NOT EXISTS idx_account_audit_merchant ON account_audit (merchant, ts);

CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, business TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL, created_ts INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', contact_email TEXT, billing_email TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS agent_audit (
    id TEXT PRIMARY KEY, key_id TEXT NOT NULL, merchant TEXT NOT NULL,
    action TEXT NOT NULL, target_id TEXT NOT NULL, request_id TEXT NOT NULL,
    input_hash TEXT NOT NULL DEFAULT '',
    created_ts INTEGER NOT NULL, UNIQUE (key_id, request_id)
  );
CREATE INDEX IF NOT EXISTS idx_agent_audit_merchant ON agent_audit (merchant, created_ts);

CREATE TABLE IF NOT EXISTS agent_keys (
    id TEXT PRIMARY KEY, merchant TEXT NOT NULL, account_id TEXT NOT NULL,
    account_epoch INTEGER NOT NULL, label TEXT NOT NULL, token_hash TEXT NOT NULL,
    scopes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, last_used_ts INTEGER NOT NULL DEFAULT 0
  , issuer TEXT NOT NULL DEFAULT 'owner');
CREATE INDEX IF NOT EXISTS idx_agent_keys_owner ON agent_keys (account_id, merchant);

CREATE TABLE IF NOT EXISTS ai_usage (
  merchant TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, day)
);

CREATE TABLE IF NOT EXISTS ai_usage_kind (merchant TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (merchant, day, kind));

CREATE TABLE IF NOT EXISTS cash_session_events (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, session_id TEXT NOT NULL, terminal_id TEXT NOT NULL, event_type TEXT NOT NULL CHECK (event_type IN ('open','movement','handover','close')), expected_cents INTEGER, counted_cents INTEGER, gap_cents INTEGER, movement_kind TEXT, movement_amount_cents INTEGER, movement_reason TEXT, actor_id TEXT NOT NULL, counterparty_actor_id TEXT, opened_ts INTEGER NOT NULL, occurred_ts INTEGER NOT NULL, gap_reason TEXT);
CREATE INDEX IF NOT EXISTS idx_cash_session_events_merchant_ts ON cash_session_events (merchant, occurred_ts);
CREATE INDEX IF NOT EXISTS idx_cash_session_events_terminal_session ON cash_session_events (merchant, terminal_id, session_id, occurred_ts);

CREATE TABLE IF NOT EXISTS catalogs (
  merchant   TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_links ( id TEXT PRIMARY KEY, merchant TEXT NOT NULL, channel TEXT NOT NULL, label TEXT, hash TEXT NOT NULL, config TEXT, status TEXT NOT NULL DEFAULT 'active', created_ts INTEGER NOT NULL, last_ts INTEGER, last_err TEXT );
CREATE INDEX IF NOT EXISTS idx_channel_links_merchant ON channel_links (merchant, channel);

CREATE TABLE IF NOT EXISTS client_errors (id TEXT PRIMARY KEY, merchant TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, file TEXT NOT NULL DEFAULT '', line INTEGER NOT NULL DEFAULT 0, col INTEGER NOT NULL DEFAULT 0, stack TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '', user_agent TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL DEFAULT 1, first_seen_ts INTEGER NOT NULL, last_seen_ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_client_errors_seen ON client_errors (merchant, last_seen_ts);
CREATE INDEX IF NOT EXISTS idx_client_errors_sig ON client_errors (merchant, file, line, message);

CREATE TABLE IF NOT EXISTS client_purchase_events (
  merchant TEXT NOT NULL,
  ref TEXT NOT NULL,
  client_id TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  stamps INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 1,
  created_ts INTEGER NOT NULL,
  srv_ts INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT '', items TEXT NOT NULL DEFAULT '[]', sale_ref TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (merchant, ref)
);
CREATE INDEX IF NOT EXISTS idx_client_purchase_events_sync
  ON client_purchase_events (merchant, srv_ts);

CREATE TABLE IF NOT EXISTS client_reward_events (
  merchant TEXT NOT NULL,
  ref TEXT NOT NULL,
  client_id TEXT NOT NULL,
  points_delta INTEGER NOT NULL DEFAULT 0,
  stamps_delta INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL,
  srv_ts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, ref)
);
CREATE INDEX IF NOT EXISTS idx_client_reward_events_sync
  ON client_reward_events (merchant, srv_ts);

CREATE TABLE IF NOT EXISTS client_sync_sequences (merchant TEXT PRIMARY KEY, last_ts INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS clients (
  merchant      TEXT NOT NULL,
  id            TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  birthday      TEXT NOT NULL DEFAULT '',
  gender        TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  points        INTEGER NOT NULL DEFAULT 0,
  stamps        INTEGER NOT NULL DEFAULT 0,
  visits        INTEGER NOT NULL DEFAULT 0,
  spend         INTEGER NOT NULL DEFAULT 0,
  consent       INTEGER NOT NULL DEFAULT 0,
  consent_email INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'caisse',
  first_seen    INTEGER NOT NULL DEFAULT 0,
  last_seen     INTEGER NOT NULL DEFAULT 0,
  updated_ts    INTEGER NOT NULL DEFAULT 0,
  srv_ts        INTEGER NOT NULL DEFAULT 0,
  deleted       INTEGER NOT NULL DEFAULT 0, hospitality TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (merchant, id)
);
CREATE INDEX IF NOT EXISTS idx_clients_sync ON clients (merchant, srv_ts);

CREATE TABLE IF NOT EXISTS config_audit ( id INTEGER PRIMARY KEY AUTOINCREMENT, merchant TEXT NOT NULL, feature TEXT NOT NULL, enabled INTEGER NOT NULL, actor TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL );
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON config_audit (merchant, ts);

CREATE TABLE IF NOT EXISTS demo_requests (
  id          TEXT PRIMARY KEY,
  reference   TEXT NOT NULL UNIQUE,
  created_ts  INTEGER NOT NULL,
  first_name  TEXT NOT NULL,
  business    TEXT NOT NULL,
  trade       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL,
  email       TEXT NOT NULL DEFAULT '',
  slot_day    TEXT NOT NULL DEFAULT '',
  slot_part   TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  lang        TEXT NOT NULL DEFAULT '',
  page        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',
  handled_by  TEXT NOT NULL DEFAULT '',
  notified    TEXT NOT NULL DEFAULT '',
  updated_ts  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_demo_requests_created ON demo_requests(created_ts);

CREATE TABLE IF NOT EXISTS device_alerts (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, device_id TEXT NOT NULL,
      code TEXT NOT NULL, opened_ts INTEGER NOT NULL, closed_ts INTEGER NOT NULL DEFAULT 0,
      acked_ts INTEGER NOT NULL DEFAULT 0, acked_by TEXT NOT NULL DEFAULT ''
    );
CREATE INDEX IF NOT EXISTS idx_device_alert_open ON device_alerts (merchant, device_id, closed_ts);

CREATE TABLE IF NOT EXISTS device_health (
      merchant TEXT NOT NULL, device_id TEXT NOT NULL,
      app TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '',
      online INTEGER NOT NULL DEFAULT 1, standalone INTEGER NOT NULL DEFAULT 0,
      printer_configured INTEGER NOT NULL DEFAULT 0, printer_connected INTEGER NOT NULL DEFAULT 0,
      alert TEXT NOT NULL DEFAULT '', alert_since_ts INTEGER NOT NULL DEFAULT 0,
      acked_ts INTEGER NOT NULL DEFAULT 0, acked_by TEXT NOT NULL DEFAULT '',
      beats INTEGER NOT NULL DEFAULT 0,
      first_seen_ts INTEGER NOT NULL, last_seen_ts INTEGER NOT NULL, custom_label TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (merchant, device_id)
    );
CREATE INDEX IF NOT EXISTS idx_device_seen ON device_health (merchant, last_seen_ts);

CREATE TABLE IF NOT EXISTS doc_history (merchant TEXT NOT NULL, kind TEXT NOT NULL, feature TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER NOT NULL, saved_ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_doc_history ON doc_history(merchant, kind, feature, saved_ts);

CREATE TABLE IF NOT EXISTS employee_auth_versions (
  merchant     TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 0,
  pin_digest   TEXT NOT NULL,
  updated_ts   INTEGER NOT NULL,
  PRIMARY KEY (merchant, member_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_auth_versions_merchant
  ON employee_auth_versions(merchant);

CREATE TABLE IF NOT EXISTS employee_loyalty_events (
    merchant TEXT NOT NULL, ref TEXT NOT NULL, client_id TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0, created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, ref));

CREATE TABLE IF NOT EXISTS game_scores (
    id TEXT PRIMARY KEY, merchant TEXT NOT NULL, month TEXT NOT NULL, session_id TEXT NOT NULL,
    table_no TEXT, quiz_id TEXT NOT NULL, round_id TEXT NOT NULL DEFAULT '', nickname TEXT NOT NULL,
    nick_key TEXT NOT NULL, score INTEGER NOT NULL, correct INTEGER NOT NULL, total INTEGER NOT NULL,
    created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_game_scores_month ON game_scores (merchant, month);

CREATE TABLE IF NOT EXISTS hotel_internal_request_events (  merchant TEXT NOT NULL,  id TEXT NOT NULL,  request_id TEXT NOT NULL,  revision INTEGER NOT NULL,  event TEXT NOT NULL,  idempotency_key TEXT NOT NULL,  actor_id TEXT NOT NULL DEFAULT '',  actor_name TEXT NOT NULL DEFAULT '',  payload TEXT NOT NULL DEFAULT '{}',  ts INTEGER NOT NULL,  PRIMARY KEY (merchant, id),  UNIQUE (merchant, idempotency_key));
CREATE INDEX IF NOT EXISTS idx_hotel_request_events  ON hotel_internal_request_events (merchant, request_id, revision);

CREATE TABLE IF NOT EXISTS hotel_internal_request_lines (  merchant TEXT NOT NULL,  request_id TEXT NOT NULL,  line_no INTEGER NOT NULL,  item_id TEXT NOT NULL,  unit TEXT NOT NULL,  conversion_snapshot TEXT NOT NULL,  qty_requested_base_milli INTEGER NOT NULL,  qty_requested REAL NOT NULL,  qty_approved REAL NOT NULL DEFAULT 0,  qty_prepared REAL NOT NULL DEFAULT 0,  qty_received REAL NOT NULL DEFAULT 0,  resolution TEXT NOT NULL DEFAULT 'pending',  substitute_for TEXT NOT NULL DEFAULT '',  note TEXT NOT NULL DEFAULT '',  PRIMARY KEY (merchant, request_id, line_no));

CREATE TABLE IF NOT EXISTS hotel_internal_requests (  merchant TEXT NOT NULL,  id TEXT NOT NULL,  unit_id TEXT NOT NULL,  state TEXT NOT NULL DEFAULT 'draft',  cancelled INTEGER NOT NULL DEFAULT 0,  revision INTEGER NOT NULL DEFAULT 1,  create_key TEXT NOT NULL,  last_command_key TEXT NOT NULL DEFAULT '',  requester_id TEXT NOT NULL DEFAULT '',  requester_name TEXT NOT NULL DEFAULT '',  review_revision INTEGER NOT NULL DEFAULT 0,  accepted_revision INTEGER NOT NULL DEFAULT 0,  fulfilment_method TEXT NOT NULL DEFAULT 'pickup',  delivery_started_ts INTEGER,  disputed INTEGER NOT NULL DEFAULT 0,  created_ts INTEGER NOT NULL,  updated_ts INTEGER NOT NULL,  submitted_ts INTEGER,  closed_ts INTEGER,  PRIMARY KEY (merchant, id),  UNIQUE (merchant, create_key));
CREATE INDEX IF NOT EXISTS idx_hotel_requests_unit  ON hotel_internal_requests (merchant, unit_id, updated_ts);

CREATE TABLE IF NOT EXISTS hotel_room_charge_events (  merchant TEXT NOT NULL,  id TEXT NOT NULL,  kind TEXT NOT NULL,  sale_id TEXT NOT NULL,  outlet_id TEXT NOT NULL,  shift_id TEXT NOT NULL,  cashier_id TEXT NOT NULL,  cashier_name TEXT NOT NULL DEFAULT '',  amount_cents INTEGER NOT NULL,  occurred_ts INTEGER NOT NULL,  reversal_of TEXT NOT NULL DEFAULT '',  reversed_by_id TEXT NOT NULL DEFAULT '',  PRIMARY KEY (merchant, id),  UNIQUE (merchant, sale_id, kind));
CREATE INDEX IF NOT EXISTS idx_hotel_room_charge_shift  ON hotel_room_charge_events (merchant, shift_id, occurred_ts);

CREATE TABLE IF NOT EXISTS hotel_stay_events (
  merchant      TEXT NOT NULL,
  id            TEXT NOT NULL,
  stay_id       TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  occurred_ts   INTEGER NOT NULL,
  srv_cursor    INTEGER NOT NULL,
  event_ordinal INTEGER NOT NULL DEFAULT 0,
  actor_id      TEXT NOT NULL,
  actor_role    TEXT NOT NULL,
  PRIMARY KEY (merchant, id),
  UNIQUE (merchant, srv_cursor, event_ordinal)
);
CREATE INDEX IF NOT EXISTS idx_hotel_stay_events_stay
  ON hotel_stay_events (merchant, stay_id, srv_cursor);

CREATE TABLE IF NOT EXISTS inventory_count_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  event TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  via TEXT,
  note TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_count_events_merchant_count ON inventory_count_events (merchant, count_id, ts);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  store_id TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL DEFAULT '',
  employee_id TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  employee_role TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewer_id TEXT DEFAULT '',
  reviewer_name TEXT DEFAULT '',
  review_decision TEXT DEFAULT '',
  review_note TEXT DEFAULT '',
  applied_at INTEGER,
  total_lines INTEGER NOT NULL DEFAULT 0,
  total_counted REAL NOT NULL DEFAULT 0,
  total_system REAL NOT NULL DEFAULT 0,
  total_diff REAL NOT NULL DEFAULT 0,
  total_variance_cost_mad REAL NOT NULL DEFAULT 0,
  abs_variance_cost_mad REAL NOT NULL DEFAULT 0,
  lines_json TEXT NOT NULL DEFAULT '[]',
  meta_json TEXT DEFAULT '{}',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_date ON inventory_counts (merchant, submitted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_status ON inventory_counts (merchant, status);

CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, item_id TEXT NOT NULL,
      variant_id TEXT NOT NULL DEFAULT '', location_id TEXT NOT NULL DEFAULT 'principal',
      qty_milli INTEGER NOT NULL, reason TEXT NOT NULL, unit_cost_cents INTEGER,
      currency TEXT NOT NULL DEFAULT 'MAD', ref_type TEXT NOT NULL DEFAULT '',
      ref_id TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '',
      occurred_ts INTEGER NOT NULL, srv_ts INTEGER NOT NULL, reversal_of TEXT NOT NULL DEFAULT '',
      meta TEXT, created_ts INTEGER NOT NULL
    , unit_cost_rate INTEGER, payload_hash TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_cursor ON inventory_movements (merchant, srv_ts);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_item ON inventory_movements (merchant, item_id, occurred_ts);

CREATE TABLE IF NOT EXISTS inventory_request_reservations (
  merchant TEXT NOT NULL,
  request_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  qty_milli INTEGER NOT NULL,
  review_revision INTEGER NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, request_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_inventory_request_reservations_stock
  ON inventory_request_reservations (merchant, item_id, location_id);

CREATE TABLE IF NOT EXISTS inventory_sync_sequences (merchant TEXT PRIMARY KEY, last_ts INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS kitchen_voids (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  order_id TEXT NOT NULL,
  table_no TEXT NOT NULL,
  item_id TEXT,
  item_name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'client_change',
  is_waste INTEGER NOT NULL DEFAULT 0,
  actor TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kitchen_voids_live
  ON kitchen_voids (merchant, created_ts);

CREATE TABLE IF NOT EXISTS kiwi_ticket_followups (   id TEXT PRIMARY KEY,   ticket_id INTEGER NOT NULL REFERENCES kiwi_tickets(id) ON DELETE CASCADE,   body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),   created_ts INTEGER NOT NULL );
CREATE INDEX IF NOT EXISTS idx_kiwi_ticket_followups_ticket   ON kiwi_ticket_followups (ticket_id, created_ts);

CREATE TABLE IF NOT EXISTS kiwi_ticket_images (  id TEXT PRIMARY KEY,  ticket_id INTEGER NOT NULL REFERENCES kiwi_tickets(id) ON DELETE CASCADE,  object_key TEXT NOT NULL UNIQUE,  filename TEXT NOT NULL DEFAULT '',  content_type TEXT NOT NULL,  byte_size INTEGER NOT NULL DEFAULT 0,  created_ts INTEGER NOT NULL, followup_id TEXT);
CREATE INDEX IF NOT EXISTS idx_kiwi_ticket_images_ticket ON kiwi_ticket_images (ticket_id, created_ts);

CREATE TABLE IF NOT EXISTS kiwi_tickets (  id INTEGER PRIMARY KEY AUTOINCREMENT,  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),  status TEXT NOT NULL DEFAULT 'problem' CHECK (status IN ('problem', 'testing', 'done')),  created_ts INTEGER NOT NULL,  updated_ts INTEGER NOT NULL,  completed_ts INTEGER,  expires_ts INTEGER, kind TEXT NOT NULL DEFAULT 'unsorted', area TEXT, subkind TEXT, money_at_risk INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_kiwi_tickets_filters
  ON kiwi_tickets (status, money_at_risk DESC, kind, area, id DESC);
CREATE INDEX IF NOT EXISTS idx_kiwi_tickets_status_expiry ON kiwi_tickets (status, expires_ts);

CREATE TABLE IF NOT EXISTS menus (
  merchant   TEXT PRIMARY KEY,
  name       TEXT,
  type       TEXT,
  data       TEXT NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS merchant_config (merchant TEXT PRIMARY KEY, features TEXT NOT NULL, plan TEXT, updated_ts INTEGER NOT NULL, type TEXT, account_id TEXT, name TEXT, status TEXT, city TEXT, mrr INTEGER, subscription_kind TEXT, billing_cycle TEXT, subscription_start TEXT, subscription_end TEXT, trial_start TEXT, trial_end TEXT, trial_days INTEGER, till_epoch INTEGER NOT NULL DEFAULT 0, timezone TEXT, business_cutoff INTEGER);
CREATE INDEX IF NOT EXISTS idx_config_account ON merchant_config (account_id);

CREATE TABLE IF NOT EXISTS operational_commands (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, domain TEXT NOT NULL,
      action TEXT NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL, payload TEXT NOT NULL, result TEXT,
      requested_by TEXT NOT NULL DEFAULT '', attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL
    );
CREATE INDEX IF NOT EXISTS idx_ops_merchant_domain_time ON operational_commands (merchant, domain, updated_ts DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_merchant_idempotency ON operational_commands (merchant, idempotency_key);

CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY, command_id TEXT NOT NULL, merchant TEXT NOT NULL,
      event TEXT NOT NULL, status TEXT NOT NULL, detail TEXT,
      created_ts INTEGER NOT NULL
    , prev_hash TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL DEFAULT '', seq INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_ops_events_command ON operational_events (merchant, command_id, created_ts);

CREATE TABLE IF NOT EXISTS operational_rate (
      merchant TEXT NOT NULL, bucket TEXT NOT NULL, window_ts INTEGER NOT NULL,
      hits INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (merchant, bucket, window_ts)
    );

CREATE TABLE IF NOT EXISTS operator_notes (
  id TEXT PRIMARY KEY, merchant TEXT NOT NULL, body TEXT NOT NULL,
  actor_id TEXT NOT NULL, actor TEXT NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operator_notes ON operator_notes(merchant,ts DESC);

CREATE TABLE IF NOT EXISTS operator_task_events (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, merchant TEXT NOT NULL,
  actor_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES operator_tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_operator_task_events ON operator_task_events(merchant,ts DESC);

CREATE TABLE IF NOT EXISTS operator_tasks (
  id TEXT PRIMARY KEY, merchant TEXT NOT NULL, signal_key TEXT,
  title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','snoozed','resolved')),
  assignee TEXT NOT NULL DEFAULT '', due_ts INTEGER, snoozed_until INTEGER,
  outcome TEXT NOT NULL DEFAULT '', source_ts INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1, mutation_id TEXT NOT NULL,
  created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operator_task_merchant ON operator_tasks(merchant, updated_ts DESC);
CREATE INDEX IF NOT EXISTS idx_operator_task_queue ON operator_tasks(status, updated_ts DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_operator_task_signal ON operator_tasks(merchant, signal_key) WHERE signal_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS operators (id TEXT PRIMARY KEY, label TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL, created_ts INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS order_course (merchant TEXT NOT NULL, order_id TEXT NOT NULL, order_number INTEGER, accepted_ts INTEGER, sent_ts INTEGER, ready_ts INTEGER, served_ts INTEGER, closed_ts INTEGER, created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, order_id));
CREATE INDEX IF NOT EXISTS idx_order_course_merchant_sent ON order_course (merchant, sent_ts);

CREATE TABLE IF NOT EXISTS order_desk (
  merchant TEXT PRIMARY KEY,
  seen_ts  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_sequences (merchant TEXT NOT NULL, period INTEGER NOT NULL, next_value INTEGER NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, period));

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  merchant   TEXT NOT NULL,
  number     INTEGER NOT NULL,
  mode       TEXT NOT NULL,
  table_no   TEXT,
  total      INTEGER NOT NULL,
  lines      TEXT NOT NULL,
  status     TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
, channel TEXT, ext_ref TEXT, customer TEXT, session_id TEXT, server_name TEXT, menu_rev INTEGER, priced_ts INTEGER, client_ref TEXT, paid_ts INTEGER, cancel_actor_id TEXT NOT NULL DEFAULT '', cancel_actor_name TEXT NOT NULL DEFAULT '', cancel_ts INTEGER);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders (merchant, updated_ts);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_ref ON orders (merchant, client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_ext_ref
  ON orders (merchant, channel, ext_ref)
  WHERE ext_ref IS NOT NULL AND ext_ref <> '';

CREATE TABLE IF NOT EXISTS pair_attempts (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, first_ts INTEGER NOT NULL, blocked_until INTEGER);

CREATE TABLE IF NOT EXISTS pairings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  merchant    TEXT NOT NULL,
  type        TEXT,
  subtype     TEXT,
  name        TEXT,
  account_id  TEXT,
  created_ts  INTEGER NOT NULL,
  expires_ts  INTEGER NOT NULL,
  used_ts     INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS pairings_code_live ON pairings(code) WHERE used_ts IS NULL;

CREATE TABLE IF NOT EXISTS payment_refund_reservations (
  merchant TEXT NOT NULL, command_id TEXT NOT NULL, reference TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), status TEXT NOT NULL,
  provider_ref TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, command_id)
);
CREATE INDEX IF NOT EXISTS idx_refund_reservation_reference
  ON payment_refund_reservations(merchant, reference, status);

CREATE TABLE IF NOT EXISTS print_bridge_codes (
  code       TEXT NOT NULL,
  merchant   TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  used_ts    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_bridge_codes_live ON print_bridge_codes (code) WHERE used_ts IS NULL;

CREATE TABLE IF NOT EXISTS print_bridges (
  id           TEXT PRIMARY KEY,
  merchant     TEXT NOT NULL,
  name         TEXT,
  platform     TEXT,
  version      TEXT,
  token_hash   TEXT NOT NULL UNIQUE,   -- sha256 du jeton porteur, jamais le jeton
  created_ts   INTEGER NOT NULL,
  last_seen_ts INTEGER,
  revoked_ts   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_print_bridges_merchant ON print_bridges (merchant, revoked_ts);

CREATE TABLE IF NOT EXISTS print_jobs (
  id         TEXT PRIMARY KEY,
  merchant   TEXT NOT NULL,
  bridge_id  TEXT,                       -- NULL = n'importe quel pont du commerce
  kind       TEXT,                       -- receipt · kitchen · label · test · drawer
  target     TEXT NOT NULL,              -- JSON {ip,port} | {osPrinter}
  data_b64   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued', -- queued · claimed · done · failed · expired
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  claimed_ts INTEGER,
  done_ts    INTEGER,
  bytes      INTEGER,
  error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON print_jobs (merchant, status, created_ts);

CREATE TABLE IF NOT EXISTS push_tokens (
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'caisse',
  employee_id TEXT,
  platform TEXT NOT NULL CHECK(platform IN ('ios', 'android', 'web')),
  device_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (merchant, token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_target ON push_tokens (merchant, role);

CREATE TABLE IF NOT EXISTS reset_tokens ( selector TEXT PRIMARY KEY, account_id TEXT NOT NULL, verifier TEXT NOT NULL, created_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, used_ts INTEGER, actor TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL DEFAULT '' );
CREATE INDEX IF NOT EXISTS idx_reset_account ON reset_tokens (account_id, created_ts);

CREATE TABLE IF NOT EXISTS retail_balance_receipts (
  merchant TEXT NOT NULL,
  balance_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted')),
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, sale_id),
  FOREIGN KEY (merchant, balance_id) REFERENCES retail_balances(merchant, id)
);
CREATE INDEX IF NOT EXISTS retail_balance_receipts_by_balance
  ON retail_balance_receipts(merchant, balance_id, created_ts);

CREATE TABLE IF NOT EXISTS retail_balances (
  merchant TEXT NOT NULL,
  id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  ticket_ref TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents > 0),
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, id)
);
CREATE INDEX IF NOT EXISTS retail_balances_customer
  ON retail_balances(merchant, customer_id, created_ts DESC);
CREATE UNIQUE INDEX IF NOT EXISTS retail_balances_ticket
  ON retail_balances(merchant, ticket_ref);

CREATE TABLE IF NOT EXISTS sale_audit ( id INTEGER PRIMARY KEY AUTOINCREMENT, merchant TEXT NOT NULL, sale_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', sale_ts INTEGER NOT NULL DEFAULT 0, impact TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL , amount_cents INTEGER);
CREATE INDEX IF NOT EXISTS idx_sale_audit_merchant ON sale_audit (merchant, ts);
CREATE INDEX IF NOT EXISTS idx_sale_audit_sale ON sale_audit (sale_id);

CREATE TABLE IF NOT EXISTS sale_invoices (merchant TEXT NOT NULL, seq INTEGER NOT NULL, number TEXT NOT NULL, sale_id TEXT NOT NULL, customer TEXT, snapshot TEXT NOT NULL, created_ts INTEGER NOT NULL, PRIMARY KEY (merchant, sale_id), UNIQUE (merchant, seq));
CREATE INDEX IF NOT EXISTS idx_sale_invoices_merchant_seq ON sale_invoices (merchant, seq);

CREATE TABLE IF NOT EXISTS sale_receipts (
      merchant TEXT NOT NULL, sale_id TEXT NOT NULL,
      gross_ticket_cents INTEGER NOT NULL, consigned_cents INTEGER NOT NULL DEFAULT 0,
      created_ts INTEGER NOT NULL, PRIMARY KEY (merchant, sale_id)
    );

CREATE TABLE IF NOT EXISTS sale_settlement_keys (
    merchant TEXT NOT NULL, session_id TEXT NOT NULL, order_number TEXT NOT NULL,
    business_day TEXT NOT NULL,
    sale_id TEXT NOT NULL, created_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, session_id, order_number, business_day)
  );

CREATE TABLE IF NOT EXISTS sale_sync_conflicts (
    merchant TEXT NOT NULL, sale_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    method TEXT NOT NULL, first_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, sale_id)
  );

CREATE TABLE IF NOT EXISTS sale_void_history (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, sale_id TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', voided_ts INTEGER NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0), UNIQUE (merchant, sale_id));
CREATE INDEX IF NOT EXISTS idx_sale_void_history_merchant_ts ON sale_void_history (merchant, voided_ts);

CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, label TEXT, ref TEXT, ts INTEGER NOT NULL, lines TEXT, void_ts INTEGER, void_reason TEXT, void_note TEXT, void_actor TEXT, void_actor_id TEXT, channel TEXT, amount_cents INTEGER, gross_amount_cents INTEGER, discount_amount_cents INTEGER, discount_reason TEXT, discount_actor_id TEXT, session_id TEXT, split_flow_id TEXT, seller_id TEXT, seller_name TEXT, payment_parts TEXT, tip_cents INTEGER);
CREATE INDEX IF NOT EXISTS idx_sales_merchant ON sales (merchant);
CREATE INDEX IF NOT EXISTS idx_sales_merchant_seller_ts
  ON sales (merchant, seller_id, ts);

CREATE TABLE IF NOT EXISTS shopify_connections (  merchant TEXT PRIMARY KEY,  shop_domain TEXT NOT NULL UNIQUE,  access_token_enc TEXT NOT NULL,  refresh_token_enc TEXT,  token_expires_ts INTEGER NOT NULL DEFAULT 0,  refresh_expires_ts INTEGER NOT NULL DEFAULT 0,  scopes TEXT NOT NULL DEFAULT '',  location_id TEXT NOT NULL DEFAULT '',  location_name TEXT NOT NULL DEFAULT '',  channel_link_id TEXT NOT NULL DEFAULT '',  status TEXT NOT NULL DEFAULT 'needs_location',  connected_ts INTEGER NOT NULL,  updated_ts INTEGER NOT NULL,  last_sync_ts INTEGER NOT NULL DEFAULT 0,  last_error TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_shopify_connections_shop ON shopify_connections (shop_domain, status);

CREATE TABLE IF NOT EXISTS shopify_inbound_stock (
  merchant TEXT NOT NULL, order_ref TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  next_ts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, order_ref)
);
CREATE INDEX IF NOT EXISTS idx_shopify_inbound_due ON shopify_inbound_stock(status, next_ts);

CREATE TABLE IF NOT EXISTS shopify_oauth_states (  state_hash TEXT PRIMARY KEY,  merchant TEXT NOT NULL,  shop_domain TEXT NOT NULL,  created_ts INTEGER NOT NULL,  expires_ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_expiry ON shopify_oauth_states (expires_ts);

CREATE TABLE IF NOT EXISTS shopify_sync_outbox (  id TEXT PRIMARY KEY,  merchant TEXT NOT NULL,  kiwi_variant_id TEXT NOT NULL,  target_quantity INTEGER NOT NULL,  source_rev INTEGER NOT NULL DEFAULT 0,  status TEXT NOT NULL DEFAULT 'pending',  attempts INTEGER NOT NULL DEFAULT 0,  next_attempt_ts INTEGER NOT NULL DEFAULT 0,  last_error TEXT NOT NULL DEFAULT '',  created_ts INTEGER NOT NULL,  updated_ts INTEGER NOT NULL,  UNIQUE (merchant, kiwi_variant_id));
CREATE INDEX IF NOT EXISTS idx_shopify_sync_outbox_ready ON shopify_sync_outbox (status, next_attempt_ts, updated_ts);

CREATE TABLE IF NOT EXISTS shopify_variant_links (  merchant TEXT NOT NULL,  kiwi_variant_id TEXT NOT NULL,  shopify_variant_id TEXT NOT NULL,  inventory_item_id TEXT NOT NULL,  location_id TEXT NOT NULL,  match_method TEXT NOT NULL,  last_shopify_quantity INTEGER,  status TEXT NOT NULL DEFAULT 'active',  updated_ts INTEGER NOT NULL,  PRIMARY KEY (merchant, kiwi_variant_id),  UNIQUE (merchant, shopify_variant_id, location_id));
CREATE INDEX IF NOT EXISTS idx_shopify_variant_links_inventory ON shopify_variant_links (merchant, inventory_item_id, location_id);

CREATE TABLE IF NOT EXISTS shopify_webhook_events (  shop_domain TEXT NOT NULL,  webhook_id TEXT NOT NULL,  topic TEXT NOT NULL,  received_ts INTEGER NOT NULL,  PRIMARY KEY (shop_domain, webhook_id));
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_received ON shopify_webhook_events (received_ts);

CREATE TABLE IF NOT EXISTS staff_pins (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, pin TEXT NOT NULL, name TEXT, role TEXT NOT NULL, created_ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pins_merchant ON staff_pins (merchant);

CREATE TABLE IF NOT EXISTS store_credit_events (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, credit_id TEXT NOT NULL,
      code TEXT NOT NULL, action TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL, ref_id TEXT NOT NULL DEFAULT '',
      actor TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL
    );
CREATE INDEX IF NOT EXISTS idx_store_credit_events_credit ON store_credit_events (merchant, credit_id, ts);
CREATE INDEX IF NOT EXISTS idx_store_credit_events_sale ON store_credit_events (merchant, ref_id, action);

CREATE TABLE IF NOT EXISTS store_credits (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, code TEXT NOT NULL,
      customer_id TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL DEFAULT '',
      original_sale_id TEXT NOT NULL DEFAULT '', original_ref TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL, balance_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', expires_ts INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '', issued_by TEXT NOT NULL DEFAULT '',
      last_event_id TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL
    );
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_credit_code ON store_credits (merchant, code);
CREATE INDEX IF NOT EXISTS idx_store_credit_customer ON store_credits (merchant, customer_id, updated_ts DESC);
CREATE INDEX IF NOT EXISTS idx_store_credit_sale ON store_credits (merchant, original_sale_id);

CREATE TABLE IF NOT EXISTS store_docs (
  merchant   TEXT NOT NULL,
  feature    TEXT NOT NULL,
  data       TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, feature)
);

CREATE TABLE IF NOT EXISTS support_article_versions (id TEXT PRIMARY KEY, article_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, actor TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_article_revision ON support_article_versions (article_id, revision);

CREATE TABLE IF NOT EXISTS support_articles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, category TEXT NOT NULL, store_types TEXT NOT NULL DEFAULT '["all"]', feature_key TEXT NOT NULL DEFAULT '', feature_hash TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', revision INTEGER NOT NULL DEFAULT 1, title_fr TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '', title_ar TEXT NOT NULL DEFAULT '', body_fr TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '', body_ar TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, published_ts INTEGER, actor TEXT NOT NULL DEFAULT 'system');
CREATE INDEX IF NOT EXISTS idx_support_articles_status ON support_articles (status, category, updated_ts);

CREATE TABLE IF NOT EXISTS support_attachments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, merchant TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON support_attachments (ticket_id, created_ts);

CREATE TABLE IF NOT EXISTS support_feedback (id TEXT PRIMARY KEY, article_id TEXT NOT NULL, helpful INTEGER NOT NULL, store_type TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_support_feedback_article ON support_feedback (article_id, ts);

CREATE TABLE IF NOT EXISTS support_messages (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, kind TEXT NOT NULL, channel TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, delivery TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, ts);

CREATE TABLE IF NOT EXISTS support_searches (id TEXT PRIMARY KEY, phrase TEXT NOT NULL, lang TEXT NOT NULL, store_type TEXT NOT NULL DEFAULT '', ts INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, merchant TEXT NOT NULL, store_type TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', channel TEXT NOT NULL, contact TEXT NOT NULL, summary TEXT NOT NULL, diagnostics TEXT NOT NULL DEFAULT '{}', assignee TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL, closed_ts INTEGER, triage TEXT, triage_alert TEXT);
CREATE INDEX IF NOT EXISTS idx_support_tickets_merchant ON support_tickets (merchant, updated_ts);
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue ON support_tickets (status, priority, updated_ts);

CREATE TABLE IF NOT EXISTS table_sessions (
  id          TEXT PRIMARY KEY,
  merchant    TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'table',
  table_no    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  closed_by   TEXT NOT NULL DEFAULT '',
  opened_ts   INTEGER NOT NULL,
  seen_ts     INTEGER NOT NULL,
  closed_ts   INTEGER
, closed_actor_id TEXT NOT NULL DEFAULT '', closed_actor_name TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_tsess_live ON table_sessions (merchant, status, seen_ts);
CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_live ON table_sessions (merchant, table_no) WHERE status = 'open' AND mode = 'table';

CREATE TABLE IF NOT EXISTS table_transfers (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  from_table TEXT NOT NULL,
  to_table TEXT NOT NULL,
  session_id TEXT,
  server TEXT,
  covers INTEGER,
  orders_count INTEGER,
  is_merge INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_table_transfers_live
  ON table_transfers (merchant, created_ts);

CREATE TABLE IF NOT EXISTS tenant_guard_events (ts INTEGER NOT NULL, merchant TEXT NOT NULL, feature TEXT NOT NULL, source_merchant TEXT NOT NULL, kind TEXT NOT NULL, matched INTEGER NOT NULL, sampled INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tenant_guard_ts ON tenant_guard_events(ts);

CREATE TABLE IF NOT EXISTS ticket_sequences (merchant TEXT NOT NULL, period INTEGER NOT NULL, next_value INTEGER NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, period));

CREATE TABLE IF NOT EXISTS till_devices (
  merchant TEXT NOT NULL, device_id TEXT NOT NULL, label TEXT,
  paired_ts INTEGER, last_seen_ts INTEGER, revoked_ts INTEGER,
  PRIMARY KEY (merchant, device_id));

CREATE TABLE IF NOT EXISTS z_reconciliations (
    merchant TEXT NOT NULL, business_day TEXT NOT NULL, terminal_id TEXT NOT NULL,
    reported_count INTEGER NOT NULL, reported_cents INTEGER NOT NULL,
    server_count INTEGER NOT NULL, server_cents INTEGER NOT NULL,
    missing_count INTEGER NOT NULL, missing_cents INTEGER NOT NULL,
    mismatch_count INTEGER NOT NULL, extra_count INTEGER NOT NULL,
    status TEXT NOT NULL, result_json TEXT NOT NULL, updated_ts INTEGER NOT NULL,
    PRIMARY KEY (merchant, business_day, terminal_id)
  );
