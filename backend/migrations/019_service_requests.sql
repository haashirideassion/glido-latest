-- Migration 019: Customer Portal — service requests (Phase 2, FRD §2.4.1)
CREATE TABLE IF NOT EXISTS service_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        TEXT        UNIQUE NOT NULL,  -- SR###### shown to the customer
  customer_id       UUID        NOT NULL REFERENCES app_users(id),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id),
  service_category  TEXT        NOT NULL,         -- import | export
  stage             TEXT        NOT NULL DEFAULT 'received',
  -- Progress stages: received | in_transit | arrived | completed
  container_number  TEXT,
  container_type    TEXT,                          -- e.g. 40GP, 20GP
  container_size    TEXT,                           -- e.g. Size: 20GP (Request Details summary card)
  vessel_line       TEXT,
  voyage_number     TEXT,
  collection_date   DATE,
  terms_accepted    BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_customer_id ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_tenant_id   ON service_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_category    ON service_requests(service_category);
CREATE INDEX IF NOT EXISTS idx_service_requests_stage       ON service_requests(stage);
CREATE INDEX IF NOT EXISTS idx_service_requests_request_id  ON service_requests(request_id);

-- ── Selected services against a request (Service Selection step) ──────────────
CREATE TABLE IF NOT EXISTS service_request_services (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID       NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  service_key         TEXT       NOT NULL,
  -- collection_terminal | inspection_compliance | store | delivery | dehire | unpack
  sub_type            TEXT,      -- Store only: underbond | reefer | general
  status              TEXT       NOT NULL DEFAULT 'pending',
  -- pending | in_progress | completed
  current_info        TEXT,      -- e.g. "Compliance checks in progress"
  duration_label       TEXT,      -- e.g. "2-4 hours"
  details             JSONB      NOT NULL DEFAULT '{}'::jsonb,
  -- per-service field set, e.g. { terminal, slot, timeWindow, contact } for Collection from Terminal
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_services_request_id ON service_request_services(service_request_id);

-- ── Uploaded documents against a request (Document Upload step) ───────────────
CREATE TABLE IF NOT EXISTS service_request_documents (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID       NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  document_type       TEXT       NOT NULL DEFAULT 'general',
  filename            TEXT,
  file_size_bytes     BIGINT,
  storage_path        TEXT       NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_documents_request_id ON service_request_documents(service_request_id);
