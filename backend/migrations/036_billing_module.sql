-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 036: Billing, Rating & Revenue Module
--
-- Implements the FRS v0.2 information chain (§5.1):
--   catalogue → tariff → rating event → charge line → invoice → payment
--   → ledger sync → report
--
-- Design decisions worth stating, because they are enforced here and not in
-- application code:
--
--  * Money is NUMERIC(14,4) for stored rates (tier rates need 4dp) and
--    NUMERIC(14,2) for anything that reaches a document, with the currency
--    stored beside it. No bare numeric ever represents money (NFR-B-03).
--  * Catalogue items and rate cards are VERSIONED, never mutated in place.
--    A charge line records the version it was rated against so any historical
--    price question is answerable (SC-08, SC-12, RT-02).
--  * Issued invoices are append-only. There is no UPDATE path for totals;
--    corrections happen through credit notes (IN-06). A trigger enforces this.
--  * Nightly accrual is idempotent on (consignment, accrual_date) via a
--    unique index, so a re-run creates nothing new (RT-05, NFR-B-02).
--  * Invoice numbers are gapless and immutable, allocated from a per-tenant
--    sequence row under a row lock (IN-03).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. PRE-FLIGHT
-- Phase 1's charge calculator reads tenants.storage_free_days, but no migration
-- ever added the column — so the free allowance silently evaluated as 0. Add it
-- here (the value becomes the seeded rate line's free_allowance below) so the
-- carried-forward tariff matches what Phase 1 intended (TF-06).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tenants' AND column_name = 'storage_free_days'
  ) THEN
    ALTER TABLE tenants ADD COLUMN storage_free_days INTEGER DEFAULT 3;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CATALOGUE  (SC-01 … SC-12)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_catalogue_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,                    -- internal, never shown to customer (SC-10)
  customer_name       TEXT NOT NULL,                    -- the only name a customer sees (SC-10)
  internal_name       TEXT,
  description         TEXT,
  category            TEXT NOT NULL DEFAULT 'other',
  -- handling | storage | transport | documentation | inspection | slot | surcharge | other
  unit_of_measure     TEXT NOT NULL DEFAULT 'each',
  -- each | cbm | cbm_day | tonne | kg | pallet | container | hour | day | booking | percent
  taxability          TEXT NOT NULL DEFAULT 'standard', -- standard | gst_free | input_taxed (TX-01)
  gl_account_code     TEXT,                             -- ledger revenue account (IG-04)
  tax_code            TEXT,                             -- ledger tax code (IG-04)
  status              TEXT NOT NULL DEFAULT 'draft',    -- draft | active | superseded | inactive
  is_bundle           BOOLEAN NOT NULL DEFAULT FALSE,   -- SC-06
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_by          UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_catalogue_items_code_uniq UNIQUE (tenant_id, code),
  CONSTRAINT billing_catalogue_items_status_chk
    CHECK (status IN ('draft', 'active', 'superseded', 'inactive')),
  CONSTRAINT billing_catalogue_items_tax_chk
    CHECK (taxability IN ('standard', 'gst_free', 'input_taxed'))
);
CREATE INDEX IF NOT EXISTS idx_billing_catalogue_tenant
  ON billing_catalogue_items (tenant_id, status, category);

-- Immutable snapshot of an item at a point in time (SC-08, C-04).
-- Written on every meaningful change; charge lines point at a version id.
CREATE TABLE IF NOT EXISTS billing_catalogue_item_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             UUID NOT NULL REFERENCES billing_catalogue_items(id) ON DELETE CASCADE,
  version_no          INTEGER NOT NULL,
  effective_from      DATE NOT NULL,
  effective_to        DATE,                             -- NULL = current
  snapshot            JSONB NOT NULL,                   -- the whole item as it stood
  changed_by          UUID REFERENCES app_users(id),
  change_note         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_catalogue_versions_uniq UNIQUE (item_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_billing_catalogue_versions_item
  ON billing_catalogue_item_versions (item_id, effective_from DESC);

-- When does this item appear in the booking wizard? (SC-03, SC-04, C-03)
-- NULL in a dimension column means "any" — the matrix is sparse on purpose.
CREATE TABLE IF NOT EXISTS billing_applicability_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES billing_catalogue_items(id) ON DELETE CASCADE,
  service_type        TEXT,                             -- pickup | dropoff | NULL = any
  load_type           TEXT,                             -- fcl | lcl | NULL = any
  cargo_type          TEXT,
  customer_segment    TEXT,                             -- account | guest | NULL = any
  site_id             UUID REFERENCES tenants(id),      -- multi-site tenants; NULL = all sites
  attach_mode         TEXT NOT NULL DEFAULT 'optional', -- mandatory | optional | conditional
  trigger_expr        TEXT,                             -- only for attach_mode = conditional
  default_quantity    NUMERIC(14,4),
  priority            INTEGER NOT NULL DEFAULT 100,     -- lower wins when rules collide
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_applicability_mode_chk
    CHECK (attach_mode IN ('mandatory', 'optional', 'conditional'))
);
CREATE INDEX IF NOT EXISTS idx_billing_applicability_lookup
  ON billing_applicability_rules (tenant_id, active, service_type, load_type);

-- Bundles (SC-06, C-05)
CREATE TABLE IF NOT EXISTS billing_bundle_components (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_item_id      UUID NOT NULL REFERENCES billing_catalogue_items(id) ON DELETE CASCADE,
  component_item_id   UUID NOT NULL REFERENCES billing_catalogue_items(id) ON DELETE RESTRICT,
  quantity            NUMERIC(14,4) NOT NULL DEFAULT 1,
  CONSTRAINT billing_bundle_uniq UNIQUE (bundle_item_id, component_item_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TARIFF  (TF-01 … TF-15)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_rate_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  site_id             UUID REFERENCES tenants(id),
  currency            TEXT NOT NULL DEFAULT 'AUD',
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  status              TEXT NOT NULL DEFAULT 'draft',
  -- draft | reviewed | active | superseded | archived  (state machine §4)
  is_site_default     BOOLEAN NOT NULL DEFAULT FALSE,   -- fallback when no customer card (TF-02)
  rounding_mode       TEXT NOT NULL DEFAULT 'half_up',  -- half_up | half_even | up | down (RT-10)
  rounding_dp         INTEGER NOT NULL DEFAULT 2,
  supersedes_card_id  UUID REFERENCES billing_rate_cards(id),
  version_no          INTEGER NOT NULL DEFAULT 1,
  reviewed_by         UUID REFERENCES app_users(id),
  reviewed_at         TIMESTAMPTZ,
  published_by        UUID REFERENCES app_users(id),    -- approver of record (TF-12)
  published_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_rate_cards_status_chk
    CHECK (status IN ('draft', 'reviewed', 'active', 'superseded', 'archived')),
  CONSTRAINT billing_rate_cards_rounding_chk
    CHECK (rounding_mode IN ('half_up', 'half_even', 'up', 'down')),
  CONSTRAINT billing_rate_cards_window_chk
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS idx_billing_rate_cards_tenant
  ON billing_rate_cards (tenant_id, status, effective_from DESC);
-- At most one default card per (tenant, site) among live cards.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_rate_cards_one_default
  ON billing_rate_cards (tenant_id, COALESCE(site_id, tenant_id))
  WHERE is_site_default AND status = 'active';

CREATE TABLE IF NOT EXISTS billing_rate_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id        UUID NOT NULL REFERENCES billing_rate_cards(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES billing_catalogue_items(id) ON DELETE RESTRICT,
  rate_type           TEXT NOT NULL DEFAULT 'flat',
  -- flat | per_unit | graduated | volume_band | threshold | percent_of_base
  --   (TF-04 … TF-07). min_charge / max_cap are modifiers, not types.
  unit_rate           NUMERIC(14,4),                    -- flat / per_unit
  percent_of          NUMERIC(9,4),                     -- percent_of_base, e.g. 12.5000 = 12.5%
  percent_base_item   UUID REFERENCES billing_catalogue_items(id),
  min_quantity        NUMERIC(14,4),                    -- charge at least this many units (TF-07)
  min_charge          NUMERIC(14,2),                    -- floor on the line total (TF-07)
  max_cap             NUMERIC(14,2),                    -- ceiling on the line total (TF-07)
  free_allowance      NUMERIC(14,4),                    -- overrides item/tenant default (TF-06)
  free_allowance_unit TEXT,                             -- day | unit
  formula_id          UUID,                             -- chargeable-quantity formula (TF-08)
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_rate_lines_uniq UNIQUE (rate_card_id, item_id),
  CONSTRAINT billing_rate_lines_type_chk
    CHECK (rate_type IN ('flat', 'per_unit', 'graduated', 'volume_band',
                         'threshold', 'percent_of_base'))
);
CREATE INDEX IF NOT EXISTS idx_billing_rate_lines_card
  ON billing_rate_lines (rate_card_id);

-- Tier / band table for graduated, volume_band and threshold rate types (TF-05).
--   graduated   → each tier prices only the units that fall inside it
--   volume_band → the band the total quantity lands in prices every unit
--   threshold   → tier applies from from_qty onward (escalating demurrage)
CREATE TABLE IF NOT EXISTS billing_rate_tiers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_line_id        UUID NOT NULL REFERENCES billing_rate_lines(id) ON DELETE CASCADE,
  tier_no             INTEGER NOT NULL,
  from_qty            NUMERIC(14,4) NOT NULL DEFAULT 0, -- inclusive
  to_qty              NUMERIC(14,4),                    -- exclusive; NULL = unbounded
  unit_rate           NUMERIC(14,4) NOT NULL,
  flat_amount         NUMERIC(14,2),                    -- optional per-tier flat component
  CONSTRAINT billing_rate_tiers_uniq UNIQUE (rate_line_id, tier_no),
  CONSTRAINT billing_rate_tiers_window_chk CHECK (to_qty IS NULL OR to_qty > from_qty)
);
CREATE INDEX IF NOT EXISTS idx_billing_rate_tiers_line
  ON billing_rate_tiers (rate_line_id, from_qty);

-- Chargeable-quantity formulas — replaces the hard-coded MAX(kg/1000, cbm) rule (TF-08, T-04).
CREATE TABLE IF NOT EXISTS billing_qty_formulas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  expression          TEXT NOT NULL,
  -- Safe expression over named inputs, evaluated by lib/formula.ts:
  --   MAX(weight_kg / weight_divisor, volume_cbm)
  inputs              JSONB NOT NULL DEFAULT '{}'::jsonb,  -- constants, e.g. {"weight_divisor":1000}
  description         TEXT,
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_qty_formulas_name_uniq UNIQUE (tenant_id, name)
);

DO $$ BEGIN
  ALTER TABLE billing_rate_lines
    ADD CONSTRAINT billing_rate_lines_formula_fk
    FOREIGN KEY (formula_id) REFERENCES billing_qty_formulas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Surcharges & levies: after-hours, peak, holiday, hazardous, fuel (TF-09, T-05)
CREATE TABLE IF NOT EXISTS billing_surcharges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rate_card_id        UUID REFERENCES billing_rate_cards(id) ON DELETE CASCADE,
  item_id             UUID REFERENCES billing_catalogue_items(id) ON DELETE SET NULL,
  code                TEXT NOT NULL,
  label               TEXT NOT NULL,                    -- customer-facing
  basis               TEXT NOT NULL DEFAULT 'percent',  -- percent | fixed | per_unit
  value               NUMERIC(14,4) NOT NULL,
  applies_to          TEXT NOT NULL DEFAULT 'subtotal', -- subtotal | item | category
  applies_to_ref      TEXT,                             -- item id or category name
  condition_kind      TEXT NOT NULL DEFAULT 'always',
  -- always | after_hours | weekend | public_holiday | hazardous | date_range | expression
  condition_config    JSONB NOT NULL DEFAULT '{}'::jsonb,
  taxability          TEXT NOT NULL DEFAULT 'standard',
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_surcharges_basis_chk CHECK (basis IN ('percent', 'fixed', 'per_unit')),
  CONSTRAINT billing_surcharges_code_uniq UNIQUE (tenant_id, code)
);

-- Public holiday calendar feeding condition_kind = 'public_holiday'
CREATE TABLE IF NOT EXISTS billing_holidays (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  holiday_date        DATE NOT NULL,
  label               TEXT,
  CONSTRAINT billing_holidays_uniq UNIQUE (tenant_id, holiday_date)
);

-- Discounts, coupons, concessions (TF-10, T-06)
CREATE TABLE IF NOT EXISTS billing_discounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  label               TEXT NOT NULL,
  discount_type       TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
  value               NUMERIC(14,4) NOT NULL,
  scope               TEXT NOT NULL DEFAULT 'invoice', -- invoice | item | category
  scope_ref           TEXT,
  account_id          UUID,                            -- standing discount for one account
  approval_threshold  NUMERIC(14,2),                   -- above this, an approver is required
  valid_from          DATE,
  valid_to            DATE,
  max_redemptions     INTEGER,
  redemptions_used    INTEGER NOT NULL DEFAULT 0,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_discounts_code_uniq UNIQUE (tenant_id, code),
  CONSTRAINT billing_discounts_type_chk CHECK (discount_type IN ('percent', 'fixed'))
);

-- Saved simulator scenarios (TF-11, T-08)
CREATE TABLE IF NOT EXISTS billing_rate_scenarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  inputs              JSONB NOT NULL,                  -- a RatingContext payload
  expected_total      NUMERIC(14,2),                   -- optional regression assertion
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TAX  (TX-01 … TX-08, S-01)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_tax_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id             UUID REFERENCES tenants(id),
  is_registered       BOOLEAN NOT NULL DEFAULT TRUE,    -- TX-03: changes invoice wording
  abn                 TEXT,
  jurisdiction        TEXT NOT NULL DEFAULT 'AU',
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,
  standard_rate       NUMERIC(9,4) NOT NULL DEFAULT 10.0000, -- percent (TX-02)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_tax_settings_tenant
  ON billing_tax_settings (tenant_id, effective_from DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CUSTOMER ACCOUNTS & CREDIT  (AR-01 … AR-12)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_code        TEXT NOT NULL,
  legal_name          TEXT NOT NULL,
  trading_name        TEXT,
  abn                 TEXT,
  billing_email       TEXT,
  billing_contact     TEXT,
  billing_phone       TEXT,
  billing_address     TEXT,
  status              TEXT NOT NULL DEFAULT 'prospect',
  -- prospect | active | on_hold | suspended | closed  (state machine §4)
  payment_terms       TEXT NOT NULL DEFAULT 'net_30',  -- net_7 | net_14 | net_30 | eom | custom
  payment_terms_days  INTEGER NOT NULL DEFAULT 30,
  credit_limit        NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'AUD',
  rate_card_id        UUID REFERENCES billing_rate_cards(id) ON DELETE SET NULL, -- TF-03
  statement_frequency TEXT NOT NULL DEFAULT 'monthly', -- none | weekly | fortnightly | monthly
  invoice_cycle       TEXT NOT NULL DEFAULT 'per_booking',
  -- per_booking | weekly | fortnightly | monthly  (IN-02, consolidation cycle lives here — SQ-03)
  credit_hold         BOOLEAN NOT NULL DEFAULT FALSE,  -- AR-11
  credit_hold_reason  TEXT,
  credit_hold_at      TIMESTAMPTZ,
  user_id             UUID REFERENCES app_users(id),   -- portal login, if any
  approved_by         UUID REFERENCES app_users(id),
  approved_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_accounts_code_uniq UNIQUE (tenant_id, account_code),
  CONSTRAINT billing_accounts_status_chk
    CHECK (status IN ('prospect', 'active', 'on_hold', 'suspended', 'closed')),
  CONSTRAINT billing_accounts_cycle_chk
    CHECK (invoice_cycle IN ('per_booking', 'weekly', 'fortnightly', 'monthly'))
);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_tenant
  ON billing_accounts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_user
  ON billing_accounts (user_id) WHERE user_id IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE billing_discounts
    ADD CONSTRAINT billing_discounts_account_fk
    FOREIGN KEY (account_id) REFERENCES billing_accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Credit-limit override requests (AR-03, A-08)
CREATE TABLE IF NOT EXISTS billing_credit_overrides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  requested_amount    NUMERIC(14,2) NOT NULL,
  exposure_at_request NUMERIC(14,2) NOT NULL,
  reason              TEXT NOT NULL,                   -- mandatory (cross-cutting rule 5)
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined | expired
  requested_by        UUID REFERENCES app_users(id),
  decided_by          UUID REFERENCES app_users(id),
  decided_at          TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_credit_overrides_status_chk
    CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  -- Segregation of duties: an approver may not approve their own request (S-10, TX-08)
  CONSTRAINT billing_credit_overrides_no_self_approval
    CHECK (decided_by IS NULL OR requested_by IS NULL OR decided_by <> requested_by)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CHARGE LINES  (RT-01 … RT-11)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_charge_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id          UUID REFERENCES bookings(id) ON DELETE CASCADE,
  account_id          UUID REFERENCES billing_accounts(id) ON DELETE SET NULL,
  item_id             UUID REFERENCES billing_catalogue_items(id) ON DELETE SET NULL,

  -- Rating snapshot — frozen at confirmation so the price is reproducible (RT-02).
  item_version_id     UUID REFERENCES billing_catalogue_item_versions(id),
  rate_card_id        UUID REFERENCES billing_rate_cards(id),
  rate_card_version   INTEGER,
  rate_snapshot       JSONB,                            -- the rate line + tiers, verbatim

  description         TEXT NOT NULL,                    -- customer-facing (SC-10)
  unit_of_measure     TEXT NOT NULL DEFAULT 'each',
  quantity            NUMERIC(14,4) NOT NULL DEFAULT 1,
  chargeable_quantity NUMERIC(14,4) NOT NULL DEFAULT 1, -- after formula + free allowance
  unit_price          NUMERIC(14,4) NOT NULL DEFAULT 0,
  line_subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate            NUMERIC(9,4) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'AUD',

  line_kind           TEXT NOT NULL DEFAULT 'service',
  -- service | storage | demurrage | surcharge | discount | manual | cancellation | variance
  status              TEXT NOT NULL DEFAULT 'estimated',
  -- estimated | actual | adjusted | waived | invoiced | credited  (state machine §4)
  source              TEXT NOT NULL DEFAULT 'rating',
  -- rating | accrual | manual | leakage_remedy | import

  -- "Show your working" (RT-11, X-03). Machine-readable derivation, rendered in plain
  -- language by the UI: inputs, formula, tier walk, minimum applied, free days applied.
  working             JSONB,

  -- Estimate vs actual (RT-04)
  estimated_total     NUMERIC(14,2),
  variance_amount     NUMERIC(14,2),
  variance_of_line_id UUID REFERENCES billing_charge_lines(id) ON DELETE SET NULL,

  -- Adjustment / waiver accountability (RT-08, RT-09, cross-cutting rule 5)
  original_total      NUMERIC(14,2),
  reason_code         TEXT,
  reason_note         TEXT,
  adjusted_by         UUID REFERENCES app_users(id),
  adjusted_at         TIMESTAMPTZ,
  approved_by         UUID REFERENCES app_users(id),
  approved_at         TIMESTAMPTZ,

  -- Accrual idempotency (RT-05, NFR-B-02)
  accrual_date        DATE,
  accrual_key         TEXT,

  invoice_id          UUID,
  created_by          UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT billing_charge_lines_status_chk
    CHECK (status IN ('estimated', 'actual', 'adjusted', 'waived', 'invoiced', 'credited')),
  CONSTRAINT billing_charge_lines_kind_chk
    CHECK (line_kind IN ('service', 'storage', 'demurrage', 'surcharge', 'discount',
                         'manual', 'cancellation', 'variance')),
  -- Reasons are mandatory on manual charges, adjustments and waivers.
  CONSTRAINT billing_charge_lines_reason_required
    CHECK (
      (line_kind <> 'manual' AND status NOT IN ('adjusted', 'waived'))
      OR reason_code IS NOT NULL
    )
);
CREATE INDEX IF NOT EXISTS idx_billing_charge_lines_booking
  ON billing_charge_lines (booking_id);
CREATE INDEX IF NOT EXISTS idx_billing_charge_lines_invoice
  ON billing_charge_lines (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_charge_lines_unbilled
  ON billing_charge_lines (tenant_id, status)
  WHERE invoice_id IS NULL AND status IN ('estimated', 'actual', 'adjusted');
-- One accrual per consignment per day, forever (RT-05).
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_charge_lines_accrual_idem
  ON billing_charge_lines (tenant_id, accrual_key)
  WHERE accrual_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. INVOICES  (IN-01 … IN-14)
-- ─────────────────────────────────────────────────────────────────────────────

-- Gapless, immutable numbering (IN-03). One row per tenant per prefix; the
-- allocator takes a row lock so concurrent billing runs cannot skip a number.
CREATE TABLE IF NOT EXISTS billing_number_sequences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_kind            TEXT NOT NULL,                   -- invoice | credit_note | receipt
  prefix              TEXT NOT NULL DEFAULT 'INV-',
  next_value          BIGINT NOT NULL DEFAULT 1,
  pad_width           INTEGER NOT NULL DEFAULT 6,
  CONSTRAINT billing_number_sequences_uniq UNIQUE (tenant_id, doc_kind)
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number      TEXT,                             -- NULL while draft; immutable once set
  account_id          UUID REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  booking_id          UUID REFERENCES bookings(id) ON DELETE SET NULL, -- single-booking invoices
  doc_type            TEXT NOT NULL DEFAULT 'invoice',  -- invoice | proforma (IN-08)

  status              TEXT NOT NULL DEFAULT 'draft',
  -- draft | issued | part_paid | paid | overdue | disputed | credited
  -- | part_credited | written_off | void   (state machine §4, IN-11)

  issue_date          DATE,
  due_date            DATE,
  period_start        DATE,                             -- for cycle invoices
  period_end          DATE,

  currency            TEXT NOT NULL DEFAULT 'AUD',
  subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid         NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_credited     NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_written_off  NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due         NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Tax invoice assertions (IN-04, TX-03)
  is_tax_invoice      BOOLEAN NOT NULL DEFAULT TRUE,
  supplier_abn        TEXT,
  supplier_name       TEXT,
  bill_to_name        TEXT,
  bill_to_address     TEXT,
  remittance_ref      TEXT,                             -- PY-02
  terms_text          TEXT,
  notes               TEXT,

  -- Delivery (IN-09, IN-14)
  delivery_state      TEXT NOT NULL DEFAULT 'not_sent',
  -- not_sent | queued | sent | delivered | opened | bounced | failed
  delivered_at        TIMESTAMPTZ,
  peppol_state        TEXT,                             -- pending | transmitted | rejected | n/a
  peppol_message_id   TEXT,

  pay_link_token      TEXT,                             -- X-08 hosted pay-by-link (PY-04)

  dunning_step        INTEGER NOT NULL DEFAULT 0,       -- AR-06
  dunning_next_at     TIMESTAMPTZ,
  dunning_paused      BOOLEAN NOT NULL DEFAULT FALSE,   -- AR-09 dispute pauses the ladder
  dunning_pause_reason TEXT,

  issued_by           UUID REFERENCES app_users(id),
  created_by          UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT billing_invoices_number_uniq UNIQUE (tenant_id, invoice_number),
  CONSTRAINT billing_invoices_status_chk
    CHECK (status IN ('draft', 'issued', 'part_paid', 'paid', 'overdue', 'disputed',
                      'credited', 'part_credited', 'written_off', 'void')),
  CONSTRAINT billing_invoices_delivery_chk
    CHECK (delivery_state IN ('not_sent', 'queued', 'sent', 'delivered', 'opened',
                              'bounced', 'failed')),
  -- An issued invoice always carries a number, an issue date and a due date (IN-04).
  CONSTRAINT billing_invoices_issued_complete
    CHECK (status = 'draft' OR status = 'void'
           OR (invoice_number IS NOT NULL AND issue_date IS NOT NULL AND due_date IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant
  ON billing_invoices (tenant_id, status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_account
  ON billing_invoices (account_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_overdue
  ON billing_invoices (tenant_id, due_date)
  WHERE status IN ('issued', 'part_paid', 'overdue');
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_invoices_pay_token
  ON billing_invoices (pay_link_token) WHERE pay_link_token IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE billing_charge_lines
    ADD CONSTRAINT billing_charge_lines_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES billing_invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Invoice lines are a materialised copy of the charge lines at issue time. The
-- charge line may later be credited or adjusted; the document must not change.
CREATE TABLE IF NOT EXISTS billing_invoice_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  charge_line_id      UUID REFERENCES billing_charge_lines(id) ON DELETE SET NULL,
  booking_id          UUID REFERENCES bookings(id) ON DELETE SET NULL,
  line_no             INTEGER NOT NULL,
  description         TEXT NOT NULL,
  unit_of_measure     TEXT NOT NULL DEFAULT 'each',
  quantity            NUMERIC(14,4) NOT NULL DEFAULT 1,
  unit_price          NUMERIC(14,4) NOT NULL DEFAULT 0,
  line_subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate            NUMERIC(9,4) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxability          TEXT NOT NULL DEFAULT 'standard',
  gl_account_code     TEXT,
  tax_code            TEXT,
  working             JSONB,                            -- RT-11 travels with the document
  CONSTRAINT billing_invoice_lines_no_uniq UNIQUE (invoice_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_lines_invoice
  ON billing_invoice_lines (invoice_id, line_no);

-- Every state change on an invoice, append-only (IN-11, NFR-B-04)
CREATE TABLE IF NOT EXISTS billing_invoice_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  from_status         TEXT,
  to_status           TEXT NOT NULL,
  event_kind          TEXT NOT NULL DEFAULT 'status_change',
  -- status_change | delivery | payment | credit | dunning | dispute | note
  detail              JSONB,
  actor_id            UUID REFERENCES app_users(id),
  actor_label         TEXT,                             -- 'system', 'nightly accrual', etc.
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_invoice_events_invoice
  ON billing_invoice_events (invoice_id, created_at DESC);

-- Credit notes — the only correction path (IN-06, B-08)
CREATE TABLE IF NOT EXISTS billing_credit_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credit_note_number  TEXT,
  invoice_id          UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  account_id          UUID REFERENCES billing_accounts(id) ON DELETE RESTRICT,
  scope               TEXT NOT NULL DEFAULT 'partial',  -- full | partial
  reason_code         TEXT NOT NULL,                    -- mandatory (rule 5)
  reason_note         TEXT,
  currency            TEXT NOT NULL DEFAULT 'AUD',
  subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total               NUMERIC(14,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',    -- draft | pending_approval | issued | void
  issue_date          DATE,
  requested_by        UUID REFERENCES app_users(id),
  approved_by         UUID REFERENCES app_users(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_credit_notes_number_uniq UNIQUE (tenant_id, credit_note_number),
  CONSTRAINT billing_credit_notes_status_chk
    CHECK (status IN ('draft', 'pending_approval', 'issued', 'void')),
  -- Self-approval is refused (TX-08, S-10)
  CONSTRAINT billing_credit_notes_no_self_approval
    CHECK (approved_by IS NULL OR requested_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE IF NOT EXISTS billing_credit_note_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id      UUID NOT NULL REFERENCES billing_credit_notes(id) ON DELETE CASCADE,
  invoice_line_id     UUID REFERENCES billing_invoice_lines(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  quantity            NUMERIC(14,4) NOT NULL DEFAULT 1,
  unit_price          NUMERIC(14,4) NOT NULL DEFAULT 0,
  line_subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate            NUMERIC(9,4) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total          NUMERIC(14,2) NOT NULL DEFAULT 0
);

-- Recurring / standing charges (IN-07, B-09)
CREATE TABLE IF NOT EXISTS billing_recurring_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  item_id             UUID NOT NULL REFERENCES billing_catalogue_items(id) ON DELETE RESTRICT,
  quantity            NUMERIC(14,4) NOT NULL DEFAULT 1,
  frequency           TEXT NOT NULL DEFAULT 'monthly',  -- weekly | fortnightly | monthly | quarterly
  proration           TEXT NOT NULL DEFAULT 'none',     -- none | daily
  start_date          DATE NOT NULL,
  end_date            DATE,
  next_run_date       DATE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Billing runs (IN-13, B-02/B-03)
CREATE TABLE IF NOT EXISTS billing_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope               JSONB NOT NULL,                   -- {accountIds, siteId, periodStart, periodEnd, cycle}
  status              TEXT NOT NULL DEFAULT 'preflight',
  -- preflight | ready | running | completed | completed_with_errors | aborted
  preflight_report    JSONB,                            -- exception cases, each block-or-acknowledge
  acknowledged_by     UUID REFERENCES app_users(id),
  invoices_created    INTEGER NOT NULL DEFAULT 0,
  invoices_failed     INTEGER NOT NULL DEFAULT 0,
  result              JSONB,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_by          UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_runs_status_chk
    CHECK (status IN ('preflight', 'ready', 'running', 'completed',
                      'completed_with_errors', 'aborted'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. PAYMENTS & RECONCILIATION  (PY-01 … PY-11, AR-08)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  receipt_number      TEXT,
  account_id          UUID REFERENCES billing_accounts(id) ON DELETE SET NULL,
  method              TEXT NOT NULL DEFAULT 'eft',
  -- card | eft | compay | cash | manual | prepayment_drawdown
  source              TEXT NOT NULL DEFAULT 'manual',
  -- stripe | bank_import | compay | manual | pay_link
  received_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  currency            TEXT NOT NULL DEFAULT 'AUD',
  amount              NUMERIC(14,2) NOT NULL,
  surcharge_amount    NUMERIC(14,2) NOT NULL DEFAULT 0, -- PY-09, disclosed pre-commit
  allocated_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  unallocated_amount  NUMERIC(14,2) NOT NULL DEFAULT 0, -- held on account (AR-08)
  status              TEXT NOT NULL DEFAULT 'received',
  -- received | matched | allocated | part_allocated | reversed  (state machine §4)
  payer_reference     TEXT,                             -- what the payer quoted
  bank_reference      TEXT,
  provider_ref        TEXT,                             -- Stripe payment intent, etc.
  narrative           TEXT,                             -- raw bank statement text
  reversal_of_id      UUID REFERENCES billing_receipts(id) ON DELETE SET NULL, -- PY-08
  reversal_reason     TEXT,
  recorded_by         UUID REFERENCES app_users(id),    -- PY-07 capability-gated
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_receipts_number_uniq UNIQUE (tenant_id, receipt_number),
  CONSTRAINT billing_receipts_status_chk
    CHECK (status IN ('received', 'matched', 'allocated', 'part_allocated', 'reversed')),
  -- A reversal always carries a reason (rule 5, PY-08)
  CONSTRAINT billing_receipts_reversal_reason
    CHECK (reversal_of_id IS NULL OR reversal_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_tenant
  ON billing_receipts (tenant_id, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_receipts_unallocated
  ON billing_receipts (tenant_id) WHERE unallocated_amount > 0;

CREATE TABLE IF NOT EXISTS billing_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id          UUID NOT NULL REFERENCES billing_receipts(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  invoice_line_id     UUID REFERENCES billing_invoice_lines(id) ON DELETE SET NULL,
  amount              NUMERIC(14,2) NOT NULL,
  allocated_by        UUID REFERENCES app_users(id),
  reversed            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_allocations_amount_chk CHECK (amount <> 0)
);
CREATE INDEX IF NOT EXISTS idx_billing_allocations_invoice
  ON billing_allocations (invoice_id) WHERE NOT reversed;
CREATE INDEX IF NOT EXISTS idx_billing_allocations_receipt
  ON billing_allocations (receipt_id) WHERE NOT reversed;

-- Bank statement import → match queue (PY-05, PY-06, P-03/P-04)
CREATE TABLE IF NOT EXISTS billing_bank_imports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename            TEXT,
  format              TEXT,                             -- csv | ofx
  row_count           INTEGER NOT NULL DEFAULT 0,
  duplicate_count     INTEGER NOT NULL DEFAULT 0,
  imported_by         UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_bank_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id           UUID NOT NULL REFERENCES billing_bank_imports(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  value_date          DATE NOT NULL,
  amount              NUMERIC(14,2) NOT NULL,
  narrative           TEXT,
  reference           TEXT,
  fingerprint         TEXT NOT NULL,                    -- duplicate detection
  match_state         TEXT NOT NULL DEFAULT 'unmatched',
  -- unmatched | suggested | matched | ignored
  match_confidence    NUMERIC(5,2),
  suggested_invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
  suggested_account_id UUID REFERENCES billing_accounts(id) ON DELETE SET NULL,
  match_basis         TEXT,                             -- reference | amount | account
  receipt_id          UUID REFERENCES billing_receipts(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_bank_lines_fingerprint_uniq UNIQUE (tenant_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_billing_bank_lines_queue
  ON billing_bank_lines (tenant_id, match_state, value_date DESC);

-- Failed card payments (PY-11, P-08)
CREATE TABLE IF NOT EXISTS billing_payment_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id          UUID REFERENCES billing_invoices(id) ON DELETE CASCADE,
  booking_id          UUID REFERENCES bookings(id) ON DELETE CASCADE,
  method              TEXT NOT NULL DEFAULT 'card',
  amount              NUMERIC(14,2) NOT NULL,
  outcome             TEXT NOT NULL,                    -- succeeded | failed | pending | cancelled
  failure_code        TEXT,
  failure_message     TEXT,
  provider_ref        TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  next_retry_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prepayments / deposits held on account (AR-12, A-11)
CREATE TABLE IF NOT EXISTS billing_prepayments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  receipt_id          UUID REFERENCES billing_receipts(id) ON DELETE SET NULL,
  invoice_id          UUID REFERENCES billing_invoices(id) ON DELETE SET NULL, -- drawdown target
  direction           TEXT NOT NULL DEFAULT 'in',       -- in | drawdown | refund
  amount              NUMERIC(14,2) NOT NULL,
  note                TEXT,
  created_by          UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. COLLECTIONS, DISPUTES, WRITE-OFFS  (AR-06, AR-09, AR-10)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_dunning_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step_no             INTEGER NOT NULL,
  offset_days         INTEGER NOT NULL,                 -- negative = before due date
  channel             TEXT NOT NULL DEFAULT 'email',
  subject             TEXT,
  body_template       TEXT,
  late_fee_type       TEXT,                             -- percent | fixed | NULL
  late_fee_value      NUMERIC(14,4),
  escalate            BOOLEAN NOT NULL DEFAULT FALSE,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT billing_dunning_steps_uniq UNIQUE (tenant_id, step_no)
);

CREATE TABLE IF NOT EXISTS billing_dunning_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  step_no             INTEGER NOT NULL,
  channel             TEXT,
  outcome             TEXT,                             -- sent | failed | skipped | paused
  detail              TEXT,
  promise_to_pay_date DATE,
  actor_id            UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_dunning_log_uniq UNIQUE (invoice_id, step_no)
);

CREATE TABLE IF NOT EXISTS billing_disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  account_id          UUID REFERENCES billing_accounts(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'raised',
  -- raised | under_review | upheld | credited | adjusted | closed  (state machine §4)
  reason_code         TEXT NOT NULL,
  reason_note         TEXT,
  disputed_amount     NUMERIC(14,2),
  raised_by_label     TEXT,                             -- customer name / portal user
  raised_by_user      UUID REFERENCES app_users(id),
  resolution          TEXT,                             -- uphold | credit | adjust
  resolution_note     TEXT,
  resolved_by         UUID REFERENCES app_users(id),
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_disputes_status_chk
    CHECK (status IN ('raised', 'under_review', 'upheld', 'credited', 'adjusted', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_billing_disputes_open
  ON billing_disputes (tenant_id, status) WHERE status IN ('raised', 'under_review');

CREATE TABLE IF NOT EXISTS billing_dispute_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id          UUID NOT NULL REFERENCES billing_disputes(id) ON DELETE CASCADE,
  invoice_line_id     UUID NOT NULL REFERENCES billing_invoice_lines(id) ON DELETE CASCADE,
  CONSTRAINT billing_dispute_lines_uniq UNIQUE (dispute_id, invoice_line_id)
);

CREATE TABLE IF NOT EXISTS billing_write_offs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE RESTRICT,
  amount              NUMERIC(14,2) NOT NULL,
  reason_code         TEXT NOT NULL,
  reason_note         TEXT,
  requested_by        UUID REFERENCES app_users(id),
  approved_by         UUID REFERENCES app_users(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_write_offs_no_self_approval
    CHECK (approved_by IS NULL OR requested_by IS NULL OR approved_by <> requested_by)
);

-- Approval thresholds & segregation of duties (S-10)
CREATE TABLE IF NOT EXISTS billing_approval_thresholds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action              TEXT NOT NULL,
  -- discount | credit_note | write_off | adjustment | waiver | credit_override | refund
  threshold_amount    NUMERIC(14,2) NOT NULL DEFAULT 0, -- at or above this, an approver is required
  approver_role       TEXT NOT NULL DEFAULT 'reception_admin',
  allow_self_approval BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT billing_approval_thresholds_uniq UNIQUE (tenant_id, action)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. LEDGER INTEGRATION  (IG-01 … IG-10)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_ledger_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,                    -- xero | myob | qbo | csv | webhook
  status              TEXT NOT NULL DEFAULT 'disconnected',
  -- disconnected | connecting | connected | error
  external_org_id     TEXT,
  external_org_name   TEXT,
  access_token        TEXT,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  sync_from_date      DATE,
  last_sync_at        TIMESTAMPTZ,
  last_error          TEXT,
  connected_by        UUID REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_ledger_connections_uniq UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS billing_sync_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  doc_kind            TEXT NOT NULL,                    -- invoice | credit_note | payment | contact
  doc_id              UUID NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  -- pending | synced | failed | retrying | skipped  (state machine §4)
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  external_id         TEXT,
  idempotency_key     TEXT NOT NULL,                    -- IG-07: same doc twice → one document
  error_message       TEXT,
  error_is_actionable BOOLEAN NOT NULL DEFAULT FALSE,
  last_attempt_at     TIMESTAMPTZ,
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_sync_records_idem_uniq UNIQUE (tenant_id, provider, idempotency_key),
  CONSTRAINT billing_sync_records_status_chk
    CHECK (status IN ('pending', 'synced', 'failed', 'retrying', 'skipped'))
);
CREATE INDEX IF NOT EXISTS idx_billing_sync_records_queue
  ON billing_sync_records (tenant_id, status, created_at);

-- Outbound webhooks for tenants running their own ERP (IG-09, S-09)
CREATE TABLE IF NOT EXISTS billing_webhooks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint_url        TEXT NOT NULL,
  signing_secret      TEXT NOT NULL,
  events              TEXT[] NOT NULL DEFAULT ARRAY['invoice.issued']::TEXT[],
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_webhook_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id          UUID NOT NULL REFERENCES billing_webhooks(id) ON DELETE CASCADE,
  event               TEXT NOT NULL,
  payload             JSONB NOT NULL,
  response_status     INTEGER,
  response_body       TEXT,
  attempt             INTEGER NOT NULL DEFAULT 1,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. AUDIT & JOBS  (SC-12, TX-06, TX-07, NFR-B-04, NFR-B-08, NFR-B-10)
-- ─────────────────────────────────────────────────────────────────────────────

-- One append-only table for every financial event. Never updated, never deleted
-- inside the seven-year retention window (NFR-B-09).
CREATE TABLE IF NOT EXISTS billing_audit_log (
  id                  BIGSERIAL PRIMARY KEY,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL,
  -- catalogue_item | rate_card | rate_line | charge_line | invoice | credit_note
  -- | receipt | allocation | account | dispute | write_off | discount | sync | setting
  entity_id           UUID,
  action              TEXT NOT NULL,
  -- create | update | delete | issue | void | approve | decline | adjust | waive
  -- | credit | allocate | reverse | publish | sync | export
  before_state        JSONB,
  after_state         JSONB,
  amount_delta        NUMERIC(14,2),
  currency            TEXT,
  reason_code         TEXT,
  reason_note         TEXT,
  actor_id            UUID REFERENCES app_users(id),
  actor_label         TEXT NOT NULL DEFAULT 'system',
  actor_ip            TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_audit_log_entity
  ON billing_audit_log (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_audit_log_recent
  ON billing_audit_log (tenant_id, created_at DESC);

-- Nightly accrual / job monitor (Y-01, RT-05, NFR-B-10)
CREATE TABLE IF NOT EXISTS billing_job_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  job_name            TEXT NOT NULL,
  -- nightly_accrual | dunning_ladder | recurring_charges | ledger_sync | integrity_check
  business_date       DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'running',  -- running | succeeded | failed | skipped
  idempotency_key     TEXT NOT NULL,
  records_processed   INTEGER NOT NULL DEFAULT 0,
  records_created     INTEGER NOT NULL DEFAULT 0,
  records_skipped     INTEGER NOT NULL DEFAULT 0,
  amount_accrued      NUMERIC(14,2) NOT NULL DEFAULT 0,
  error_message       TEXT,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  duration_ms         INTEGER,
  CONSTRAINT billing_job_runs_idem_uniq UNIQUE (idempotency_key),
  CONSTRAINT billing_job_runs_status_chk
    CHECK (status IN ('running', 'succeeded', 'failed', 'skipped'))
);
CREATE INDEX IF NOT EXISTS idx_billing_job_runs_recent
  ON billing_job_runs (job_name, business_date DESC);

-- Financial integrity check results (Y-02, NFR-B-08)
CREATE TABLE IF NOT EXISTS billing_integrity_checks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  check_name          TEXT NOT NULL,
  -- lines_vs_invoice_total | invoice_vs_receivable | receivable_vs_ledger | allocation_vs_receipt
  passed              BOOLEAN NOT NULL,
  expected_value      NUMERIC(14,2),
  actual_value        NUMERIC(14,2),
  variance            NUMERIC(14,2),
  detail              JSONB,
  checked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_integrity_checks_recent
  ON billing_integrity_checks (tenant_id, checked_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. GUARDS — rules the FRS states as absolute, enforced in the database
-- ─────────────────────────────────────────────────────────────────────────────

-- IN-06 / NFR-B-04: an issued invoice's document fields are append-only. Status,
-- payment/credit/write-off balances, delivery, dunning and pay-link fields may
-- move; the numbers and identity on the document may not.
CREATE OR REPLACE FUNCTION billing_invoice_immutability_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;  -- drafts are freely editable
  END IF;

  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.issue_date    IS DISTINCT FROM OLD.issue_date
     OR NEW.subtotal      IS DISTINCT FROM OLD.subtotal
     OR NEW.tax_total     IS DISTINCT FROM OLD.tax_total
     OR NEW.total         IS DISTINCT FROM OLD.total
     OR NEW.account_id    IS DISTINCT FROM OLD.account_id
     OR NEW.currency      IS DISTINCT FROM OLD.currency
     OR NEW.supplier_abn  IS DISTINCT FROM OLD.supplier_abn
  THEN
    RAISE EXCEPTION
      'Invoice % is issued and cannot be edited. Raise a credit note instead (IN-06).',
      COALESCE(OLD.invoice_number, OLD.id::text)
      USING ERRCODE = 'check_violation',
            HINT = 'credit_note';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_invoice_immutability ON billing_invoices;
CREATE TRIGGER trg_billing_invoice_immutability
  BEFORE UPDATE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION billing_invoice_immutability_guard();

-- Invoice lines of an issued invoice are frozen entirely.
CREATE OR REPLACE FUNCTION billing_invoice_lines_frozen_guard()
RETURNS TRIGGER AS $$
DECLARE
  inv_status TEXT;
  target_invoice UUID;
BEGIN
  target_invoice := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT status INTO inv_status FROM billing_invoices WHERE id = target_invoice;

  -- A NULL status means the parent invoice row is already gone, i.e. this DELETE
  -- is the ON DELETE CASCADE from removing the invoice (or its tenant) rather
  -- than someone editing a live document. Blocking that would make an issued
  -- invoice undeletable even when its whole tenant is being torn down, so the
  -- cascade is allowed through — the guard exists to stop edits, not teardown.
  IF inv_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF inv_status <> 'draft' THEN
    RAISE EXCEPTION
      'Invoice lines are frozen once the invoice is issued. Raise a credit note instead (IN-06).'
      USING ERRCODE = 'check_violation', HINT = 'credit_note';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_invoice_lines_frozen ON billing_invoice_lines;
CREATE TRIGGER trg_billing_invoice_lines_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON billing_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION billing_invoice_lines_frozen_guard();

-- SC-09: deleting a catalogue item that any charge line, rate line or bundle
-- references is refused, with deactivation offered as the legal alternative.
CREATE OR REPLACE FUNCTION billing_catalogue_delete_guard()
RETURNS TRIGGER AS $$
DECLARE
  n_charge INTEGER;
  n_rate   INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_charge FROM billing_charge_lines WHERE item_id = OLD.id;
  SELECT COUNT(*) INTO n_rate   FROM billing_rate_lines   WHERE item_id = OLD.id;
  IF n_charge > 0 OR n_rate > 0 THEN
    RAISE EXCEPTION
      'Service "%" is referenced by % charge line(s) and % rate line(s) and cannot be deleted. Deactivate it instead (SC-09).',
      OLD.customer_name, n_charge, n_rate
      USING ERRCODE = 'foreign_key_violation', HINT = 'deactivate';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_catalogue_delete_guard ON billing_catalogue_items;
CREATE TRIGGER trg_billing_catalogue_delete_guard
  BEFORE DELETE ON billing_catalogue_items
  FOR EACH ROW EXECUTE FUNCTION billing_catalogue_delete_guard();

-- The audit log is append-only (TX-06, TX-07, NFR-B-04).
CREATE OR REPLACE FUNCTION billing_audit_log_append_only_guard()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'billing_audit_log is append-only (NFR-B-04).'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_audit_log_append_only ON billing_audit_log;
CREATE TRIGGER trg_billing_audit_log_append_only
  BEFORE UPDATE OR DELETE ON billing_audit_log
  FOR EACH ROW EXECUTE FUNCTION billing_audit_log_append_only_guard();

-- Keep balance_due honest on every write, so no code path can leave it stale.
CREATE OR REPLACE FUNCTION billing_invoice_balance_sync()
RETURNS TRIGGER AS $$
BEGIN
  NEW.balance_due :=
    ROUND(NEW.total - NEW.amount_paid - NEW.amount_credited - NEW.amount_written_off, 2);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_billing_invoice_balance_sync ON billing_invoices;
CREATE TRIGGER trg_billing_invoice_balance_sync
  BEFORE INSERT OR UPDATE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION billing_invoice_balance_sync();

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. VIEWS — the reporting surface (RP-01 … RP-10, AR-05)
-- ─────────────────────────────────────────────────────────────────────────────

-- Current exposure per account: issued and unpaid, minus credits and write-offs (AR-04).
CREATE OR REPLACE VIEW billing_account_exposure AS
SELECT
  a.id                                          AS account_id,
  a.tenant_id,
  a.account_code,
  a.legal_name,
  a.status,
  a.credit_limit,
  a.currency,
  a.credit_hold,
  COALESCE(SUM(i.balance_due), 0)               AS exposure,
  CASE WHEN a.credit_limit > 0
       THEN ROUND(COALESCE(SUM(i.balance_due), 0) / a.credit_limit * 100, 2)
       ELSE NULL END                            AS pct_of_limit,
  COUNT(i.id) FILTER (WHERE i.balance_due > 0)  AS open_invoice_count,
  MIN(i.due_date) FILTER (WHERE i.balance_due > 0) AS earliest_due_date
FROM billing_accounts a
LEFT JOIN billing_invoices i
       ON i.account_id = a.id
      AND i.status IN ('issued', 'part_paid', 'overdue', 'disputed', 'part_credited')
GROUP BY a.id, a.tenant_id, a.account_code, a.legal_name, a.status,
         a.credit_limit, a.currency, a.credit_hold;

-- Aged receivables buckets (AR-05, A-04, RP-03).
CREATE OR REPLACE VIEW billing_aged_receivables AS
SELECT
  i.tenant_id,
  i.account_id,
  a.account_code,
  a.legal_name,
  i.currency,
  SUM(i.balance_due)                                                          AS total_due,
  SUM(CASE WHEN i.due_date >= CURRENT_DATE                     THEN i.balance_due ELSE 0 END) AS bucket_current,
  SUM(CASE WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30     THEN i.balance_due ELSE 0 END) AS bucket_1_30,
  SUM(CASE WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60    THEN i.balance_due ELSE 0 END) AS bucket_31_60,
  SUM(CASE WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90    THEN i.balance_due ELSE 0 END) AS bucket_61_90,
  SUM(CASE WHEN CURRENT_DATE - i.due_date > 90                 THEN i.balance_due ELSE 0 END) AS bucket_90_plus
FROM billing_invoices i
JOIN billing_accounts a ON a.id = i.account_id
WHERE i.balance_due > 0
  AND i.status IN ('issued', 'part_paid', 'overdue', 'disputed', 'part_credited')
GROUP BY i.tenant_id, i.account_id, a.account_code, a.legal_name, i.currency;

-- Revenue by service item and period (RP-01, R-02).
CREATE OR REPLACE VIEW billing_revenue_by_service AS
SELECT
  i.tenant_id,
  DATE_TRUNC('month', i.issue_date)::DATE AS period_month,
  ci.id                                   AS item_id,
  ci.code                                 AS item_code,
  ci.customer_name                        AS item_name,
  ci.category,
  i.currency,
  COUNT(DISTINCT i.id)                    AS invoice_count,
  SUM(il.quantity)                        AS total_quantity,
  SUM(il.line_subtotal - il.discount_amount) AS net_revenue,
  SUM(il.tax_amount)                      AS tax_collected,
  SUM(il.line_total)                      AS gross_revenue
FROM billing_invoice_lines il
JOIN billing_invoices i        ON i.id = il.invoice_id
LEFT JOIN billing_charge_lines cl ON cl.id = il.charge_line_id
LEFT JOIN billing_catalogue_items ci ON ci.id = cl.item_id
WHERE i.status NOT IN ('draft', 'void')
GROUP BY i.tenant_id, DATE_TRUNC('month', i.issue_date), ci.id, ci.code,
         ci.customer_name, ci.category, i.currency;

-- Every concession, with the actor and the reason (RP-07, R-07).
CREATE OR REPLACE VIEW billing_concessions AS
SELECT
  cl.tenant_id,
  cl.id                       AS charge_line_id,
  cl.booking_id,
  cl.description,
  cl.status,
  cl.line_kind,
  cl.original_total,
  cl.line_total               AS new_total,
  COALESCE(cl.original_total, 0) - cl.line_total AS given_away,
  cl.currency,
  cl.reason_code,
  cl.reason_note,
  cl.adjusted_at              AS occurred_at,
  au.name                     AS actor_name,
  ap.name                     AS approver_name
FROM billing_charge_lines cl
LEFT JOIN app_users au ON au.id = cl.adjusted_by
LEFT JOIN app_users ap ON ap.id = cl.approved_by
WHERE cl.status IN ('adjusted', 'waived')
   OR cl.discount_amount > 0;

-- The unbilled queue behind the billing workbench (IN-01, B-01).
CREATE OR REPLACE VIEW billing_unbilled_charges AS
SELECT
  cl.tenant_id,
  cl.booking_id,
  b.reference_number,
  b.status                AS booking_status,
  b.completed_at,
  b.slot_date,
  cl.account_id,
  a.account_code,
  a.legal_name            AS account_name,
  a.invoice_cycle,
  cl.currency,
  COUNT(cl.id)            AS line_count,
  SUM(cl.line_total)      AS unbilled_total,
  MIN(cl.created_at)      AS oldest_line_at,
  BOOL_OR(cl.status = 'estimated') AS has_estimates
FROM billing_charge_lines cl
JOIN bookings b ON b.id = cl.booking_id
LEFT JOIN billing_accounts a ON a.id = cl.account_id
WHERE cl.invoice_id IS NULL
  AND cl.status IN ('estimated', 'actual', 'adjusted')
GROUP BY cl.tenant_id, cl.booking_id, b.reference_number, b.status, b.completed_at,
         b.slot_date, cl.account_id, a.account_code, a.legal_name, a.invoice_cycle,
         cl.currency;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. SEED — the standard catalogue, one default rate card, GST, dunning ladder
--     Carries the Phase 1 hard-coded rates forward so nothing regresses (C-01
--     empty-state "Seed standard catalogue" action performs the same insert).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t_id        UUID := 'a0000000-0000-0000-0000-000000000001';
  card_id     UUID;
  formula_id  UUID;
  it_storage  UUID;
  it_wrap     UUID;
  it_slot_pu  UUID;
  it_slot_do  UUID;
  it_demur    UUID;
  it_afterhrs UUID;
  demur_line_id UUID;
  t_storage_rate NUMERIC;
  t_wrap_rate    NUMERIC;
  t_fee_pickup   NUMERIC;
  t_fee_dropoff  NUMERIC;
  t_free_days    INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = t_id) THEN
    RETURN;
  END IF;

  -- Carry the Phase 1 tenant-level rates forward as the seed values.
  SELECT COALESCE(storage_rate_per_cbm, 8.50),
         COALESCE(shrink_wrap_rate_per_pallet, 12.00),
         COALESCE(slot_fee_pickup, 5.00),
         COALESCE(slot_fee_dropoff, 5.00),
         COALESCE(storage_free_days, 3)
    INTO t_storage_rate, t_wrap_rate, t_fee_pickup, t_fee_dropoff, t_free_days
    FROM tenants WHERE id = t_id;

  -- Tax settings (TX-01, TX-02)
  INSERT INTO billing_tax_settings (tenant_id, is_registered, jurisdiction, standard_rate)
  SELECT t_id, TRUE, 'AU', 10.0000
  WHERE NOT EXISTS (SELECT 1 FROM billing_tax_settings WHERE tenant_id = t_id);

  -- Numbering sequences (IN-03)
  INSERT INTO billing_number_sequences (tenant_id, doc_kind, prefix, next_value, pad_width)
  VALUES (t_id, 'invoice', 'INV-', 1, 6),
         (t_id, 'credit_note', 'CN-', 1, 6),
         (t_id, 'receipt', 'RCT-', 1, 6)
  ON CONFLICT (tenant_id, doc_kind) DO NOTHING;

  -- Chargeable-quantity formula: the Phase 1 rule, now configurable (TF-08)
  INSERT INTO billing_qty_formulas (tenant_id, name, expression, inputs, description, is_default)
  SELECT t_id, 'Revenue tonne (default)',
         'MAX(weight_kg / weight_divisor, volume_cbm)',
         '{"weight_divisor": 1000}'::jsonb,
         'Greater of weight in tonnes and volume in CBM — the Phase 1 rule, now editable.',
         TRUE
  WHERE NOT EXISTS (SELECT 1 FROM billing_qty_formulas WHERE tenant_id = t_id);
  SELECT id INTO formula_id FROM billing_qty_formulas
   WHERE tenant_id = t_id AND is_default ORDER BY created_at LIMIT 1;

  -- Standard catalogue (SC-01, SC-02)
  INSERT INTO billing_catalogue_items
    (tenant_id, code, customer_name, internal_name, description, category,
     unit_of_measure, taxability, gl_account_code, tax_code, status, sort_order)
  VALUES
    (t_id, 'STOR-LCL',  'Storage (LCL)',        'LCL warehouse storage',
     'Storage of loose cargo, charged per revenue tonne per day beyond the free allowance.',
     'storage',   'cbm_day',   'standard', '4100', 'GST', 'active', 10),
    (t_id, 'STOR-FCL',  'Storage (FCL)',        'FCL container storage',
     'Storage of a full container, charged per container per day beyond the free allowance.',
     'storage',   'container', 'standard', '4100', 'GST', 'active', 20),
    (t_id, 'DEMUR',     'Demurrage',            'Demurrage / extended dwell',
     'Escalating charge once cargo passes the agreed dwell threshold.',
     'storage',   'day',       'standard', '4110', 'GST', 'active', 30),
    (t_id, 'WRAP',      'Shrink wrapping',      'Pallet shrink wrap',
     'Shrink wrapping, charged per pallet.',
     'handling',  'pallet',    'standard', '4200', 'GST', 'active', 40),
    (t_id, 'SLOT-PU',   'Slot fee — collection','Pickup slot booking fee',
     'Booking fee for a collection slot.',
     'slot',      'booking',   'standard', '4300', 'GST', 'active', 50),
    (t_id, 'SLOT-DO',   'Slot fee — delivery',  'Dropoff slot booking fee',
     'Booking fee for a delivery slot.',
     'slot',      'booking',   'standard', '4300', 'GST', 'active', 60),
    (t_id, 'UNPACK',    'Container unpack',     'Devanning',
     'Unpacking a container to loose cargo.',
     'handling',  'container', 'standard', '4200', 'GST', 'active', 70),
    (t_id, 'INSPECT',   'Inspection attendance','Quarantine / customs inspection',
     'Attendance and handling for an inspection.',
     'inspection','hour',      'standard', '4400', 'GST', 'active', 80),
    (t_id, 'DOC-FEE',   'Documentation fee',    'Doc handling',
     'Preparation and lodgement of documentation.',
     'documentation','each',   'standard', '4500', 'GST', 'active', 90),
    (t_id, 'AFTER-HRS', 'After-hours surcharge','After-hours levy',
     'Applied to bookings serviced outside published working hours.',
     'surcharge', 'percent',   'standard', '4600', 'GST', 'active', 100),
    (t_id, 'CANCEL-FEE','Cancellation fee',     'Late cancellation / no-show',
     'Applied when a booking is cancelled inside the cancellation window or is a no-show.',
     'other',     'booking',   'standard', '4700', 'GST', 'active', 110)
  ON CONFLICT (tenant_id, code) DO NOTHING;

  SELECT id INTO it_storage  FROM billing_catalogue_items WHERE tenant_id = t_id AND code = 'STOR-LCL';
  SELECT id INTO it_wrap     FROM billing_catalogue_items WHERE tenant_id = t_id AND code = 'WRAP';
  SELECT id INTO it_slot_pu  FROM billing_catalogue_items WHERE tenant_id = t_id AND code = 'SLOT-PU';
  SELECT id INTO it_slot_do  FROM billing_catalogue_items WHERE tenant_id = t_id AND code = 'SLOT-DO';
  SELECT id INTO it_demur    FROM billing_catalogue_items WHERE tenant_id = t_id AND code = 'DEMUR';
  SELECT id INTO it_afterhrs FROM billing_catalogue_items WHERE tenant_id = t_id AND code = 'AFTER-HRS';

  -- Version 1 of every seeded item (SC-08)
  INSERT INTO billing_catalogue_item_versions (item_id, version_no, effective_from, snapshot, change_note)
  SELECT ci.id, 1, CURRENT_DATE, to_jsonb(ci), 'Seeded standard catalogue'
  FROM billing_catalogue_items ci
  WHERE ci.tenant_id = t_id
    AND NOT EXISTS (SELECT 1 FROM billing_catalogue_item_versions v WHERE v.item_id = ci.id);

  -- Applicability (SC-03, SC-04): slot fees are mandatory, storage conditional,
  -- wrapping optional on LCL.
  IF NOT EXISTS (SELECT 1 FROM billing_applicability_rules WHERE tenant_id = t_id) THEN
    INSERT INTO billing_applicability_rules
      (tenant_id, item_id, service_type, load_type, attach_mode, trigger_expr, default_quantity, priority)
    VALUES
      (t_id, it_slot_pu, 'pickup',  NULL,  'mandatory',   NULL,                      1, 10),
      (t_id, it_slot_do, 'dropoff', NULL,  'mandatory',   NULL,                      1, 10),
      (t_id, it_storage, NULL,      'lcl', 'conditional', 'storage_start_date != null', NULL, 20),
      (t_id, it_wrap,    NULL,      'lcl', 'optional',    NULL,                   NULL, 30),
      (t_id, it_demur,   NULL,      NULL,  'conditional', 'days_on_site > dwell_threshold_days', NULL, 40);
  END IF;

  -- Default rate card (TF-01, TF-02).
  --
  -- effective_from deliberately reaches back to the tenant's earliest booking
  -- rather than to today. The rating engine refuses to price against a card
  -- that was not effective on the booking's date — correctly, since a price
  -- nobody can explain is worse than no price — but a card effective from
  -- today would make every pre-existing booking unratable, so a tenant
  -- adopting the module could never bill its own backlog.
  IF NOT EXISTS (SELECT 1 FROM billing_rate_cards WHERE tenant_id = t_id) THEN
    INSERT INTO billing_rate_cards
      (tenant_id, name, currency, effective_from, status, is_site_default,
       rounding_mode, rounding_dp, published_at)
    VALUES (t_id, 'Standard rate card', 'AUD',
            LEAST(
              COALESCE((SELECT MIN(slot_date) FROM bookings WHERE tenant_id = t_id),
                       CURRENT_DATE),
              COALESCE((SELECT MIN(storage_start_date) FROM bookings WHERE tenant_id = t_id),
                       CURRENT_DATE),
              CURRENT_DATE),
            'active', TRUE, 'half_up', 2, NOW())
    RETURNING id INTO card_id;

    -- Storage: per unit per day, with the tenant's free allowance carried over (TF-06)
    INSERT INTO billing_rate_lines
      (rate_card_id, item_id, rate_type, unit_rate, free_allowance, free_allowance_unit, formula_id, notes)
    VALUES
      (card_id, it_storage, 'per_unit', t_storage_rate, t_free_days, 'day', formula_id,
       'Revenue tonne per day. Free allowance carried over from Phase 1 tenant settings.'),
      (card_id, it_wrap,    'per_unit', t_wrap_rate,    NULL, NULL, NULL, 'Per pallet.'),
      (card_id, it_slot_pu, 'flat',     t_fee_pickup,   NULL, NULL, NULL, 'Per collection booking.'),
      (card_id, it_slot_do, 'flat',     t_fee_dropoff,  NULL, NULL, NULL, 'Per delivery booking.');

    -- Demurrage: escalating by day band (TF-05, RT-06)
    INSERT INTO billing_rate_lines (rate_card_id, item_id, rate_type, notes)
    VALUES (card_id, it_demur, 'threshold', 'Escalating demurrage from day 8.')
    RETURNING id INTO demur_line_id;
    INSERT INTO billing_rate_tiers (rate_line_id, tier_no, from_qty, to_qty, unit_rate)
    VALUES (demur_line_id, 1, 0,  7,    0.00),
           (demur_line_id, 2, 7,  14,  25.00),
           (demur_line_id, 3, 14, 21,  50.00),
           (demur_line_id, 4, 21, NULL, 100.00);
  END IF;

  -- After-hours surcharge (TF-09)
  INSERT INTO billing_surcharges
    (tenant_id, item_id, code, label, basis, value, applies_to, condition_kind, condition_config)
  SELECT t_id, it_afterhrs, 'AFTER_HOURS', 'After-hours surcharge', 'percent', 15.0000,
         'subtotal', 'after_hours',
         '{"start":"18:00","end":"06:00"}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM billing_surcharges WHERE tenant_id = t_id AND code = 'AFTER_HOURS');

  INSERT INTO billing_surcharges
    (tenant_id, item_id, code, label, basis, value, applies_to, condition_kind, condition_config)
  SELECT t_id, it_afterhrs, 'WEEKEND', 'Weekend surcharge', 'percent', 20.0000,
         'subtotal', 'weekend', '{}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM billing_surcharges WHERE tenant_id = t_id AND code = 'WEEKEND');

  -- Dunning ladder (AR-06, S-05)
  INSERT INTO billing_dunning_steps (tenant_id, step_no, offset_days, channel, subject, escalate)
  VALUES
    (t_id, 1, -3, 'email', 'Invoice {{invoice_number}} falls due in 3 days',      FALSE),
    (t_id, 2,  1, 'email', 'Invoice {{invoice_number}} is now overdue',           FALSE),
    (t_id, 3,  7, 'email', 'Second reminder — invoice {{invoice_number}}',         FALSE),
    (t_id, 4, 14, 'email', 'Final notice — invoice {{invoice_number}}',           FALSE),
    (t_id, 5, 30, 'email', 'Account escalation — invoice {{invoice_number}}',     TRUE)
  ON CONFLICT (tenant_id, step_no) DO NOTHING;

  -- Approval thresholds (S-10)
  INSERT INTO billing_approval_thresholds (tenant_id, action, threshold_amount, approver_role)
  VALUES
    (t_id, 'discount',        250.00,  'reception_admin'),
    (t_id, 'credit_note',     500.00,  'reception_admin'),
    (t_id, 'write_off',         0.00,  'reception_admin'),
    (t_id, 'adjustment',      250.00,  'reception_admin'),
    (t_id, 'waiver',          100.00,  'reception_admin'),
    (t_id, 'credit_override',   0.00,  'reception_admin'),
    (t_id, 'refund',            0.00,  'reception_admin')
  ON CONFLICT (tenant_id, action) DO NOTHING;
END $$;
