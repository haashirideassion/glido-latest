-- Migration 015: tenant-configurable "Reason for Visit" lists for the kiosk's Visit Office /
-- Visit Yard walk-in flow, replacing the two hardcoded reason arrays. Split by category so
-- office and yard visits offer different reason sets, managed in Reception Settings
-- alongside Visiting Persons.
CREATE TABLE IF NOT EXISTS visit_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  category    TEXT NOT NULL CHECK (category IN ('office', 'yard')),
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_reasons_tenant_category ON visit_reasons(tenant_id, category);

-- Seed the reasons that used to be hardcoded — skipped if this tenant already has any rows,
-- so re-running the migration is safe.
INSERT INTO visit_reasons (tenant_id, category, name)
SELECT 'a0000000-0000-0000-0000-000000000001', seed.category, seed.name
FROM (VALUES
  ('office', 'Meeting with Staff'),
  ('office', 'Document Submission'),
  ('office', 'Invoice / Payment Query'),
  ('office', 'Customs Documentation'),
  ('office', 'General Enquiry'),
  ('yard', 'Container Inspection'),
  ('yard', 'Cargo Survey'),
  ('yard', 'Damage Assessment'),
  ('yard', 'Photography / Documentation'),
  ('yard', 'Customs Examination'),
  ('yard', 'Insurance Assessment'),
  ('yard', 'Quality Control Inspection')
) AS seed(category, name)
WHERE NOT EXISTS (
  SELECT 1 FROM visit_reasons WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
);
