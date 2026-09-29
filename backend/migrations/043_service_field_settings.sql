-- Migration 043: CFS-admin-configurable extra "Service Details" field per Customer Portal
-- service, one row per (tenant, service_key). Mirrors truck/trip/maintenance custom fields
-- (migration 028) but keyed per service since each service already has its own field list.

CREATE TABLE IF NOT EXISTS service_field_settings (
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  service_key TEXT        NOT NULL,
  field_label TEXT,
  field_type  TEXT        NOT NULL DEFAULT 'text',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, service_key)
);
