--
-- PostgreSQL database dump
--

\restrict P8d0bpv8cH0hqezQ6ejYkbcxwChDjEcCUHomFeiQUw6BDbcrY7mSvFLEDmsgZir

-- Dumped from database version 18.4 (be2730e)
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: allocator_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allocator_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    message text NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: allocator_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allocator_settings (
    user_id uuid NOT NULL,
    default_view text DEFAULT 'resources'::text NOT NULL,
    automated_allocation boolean DEFAULT false NOT NULL,
    operation_start_time time without time zone DEFAULT '06:00:00'::time without time zone NOT NULL,
    operation_end_time time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    new_trip_notifications boolean DEFAULT true NOT NULL,
    resource_conflict_alerts boolean DEFAULT true NOT NULL,
    maintenance_reminders boolean DEFAULT true NOT NULL,
    email_notifications boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'reception_staff'::text NOT NULL,
    password_hash text,
    password_reset_required boolean DEFAULT false NOT NULL,
    password_reset_token text,
    password_reset_expires timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    company_name text,
    phone text,
    CONSTRAINT app_users_role_check CHECK ((role = ANY (ARRAY['reception_admin'::text, 'reception_staff'::text, 'visitor_registered'::text, 'super_admin'::text, 'customer'::text, 'planner'::text, 'allocator'::text])))
);


--
-- Name: booking_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    tenant_id uuid,
    document_type text DEFAULT 'general'::text NOT NULL,
    filename text,
    file_size_bytes bigint,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_number text NOT NULL,
    session_id uuid,
    status text DEFAULT 'scheduled'::text NOT NULL,
    service_type text,
    load_type text,
    slot_date date NOT NULL,
    slot_start_time time without time zone NOT NULL,
    slot_end_time time without time zone NOT NULL,
    guest_name text,
    guest_email text,
    guest_phone text,
    company_name text,
    driver_name text NOT NULL,
    driver_phone text,
    house_bill_number text,
    container_number text,
    weight_kg numeric,
    volume_cbm numeric,
    package_count integer,
    pallet_count integer,
    pallet_type text,
    storage_start_date date,
    storage_days integer,
    storage_charge numeric,
    shrink_wrap_charge numeric,
    slot_fee numeric,
    subtotal numeric,
    gst_amount numeric,
    total_amount numeric,
    payment_method text,
    payment_status text DEFAULT 'pending'::text,
    ics_status text,
    ics_last_checked_at timestamp with time zone,
    checked_in_at timestamp with time zone,
    completed_at timestamp with time zone,
    completion_notes text,
    container_size text,
    entry_number text,
    purpose text,
    consolidator text,
    booking_reference text,
    vehicle_registration text,
    booking_group_id uuid,
    slot_index integer,
    group_reference text,
    booking_source text,
    tenant_id uuid NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    override_note text,
    overridden_at timestamp with time zone,
    eft_confirmed_at timestamp with time zone,
    staff_notes text,
    additional_reference text
);


--
-- Name: broadcast_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcast_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    recipients jsonb DEFAULT '"all"'::jsonb NOT NULL,
    template_id uuid,
    sent_by text,
    status text DEFAULT 'sent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: carrier_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carrier_profiles (
    user_id uuid NOT NULL,
    abn text,
    address text,
    notes text,
    rating numeric(3,1),
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT carrier_profiles_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT carrier_profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: carriers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carriers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    abn text,
    status text DEFAULT 'active'::text NOT NULL,
    contact_name text,
    contact_email text,
    contact_phone text,
    address text,
    notes text,
    total_bookings integer DEFAULT 0 NOT NULL,
    last_visit date,
    rating numeric(3,1),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT carriers_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT carriers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: cfs_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cfs_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    house_bill_number text NOT NULL,
    container_number text,
    weight_kg numeric,
    volume_cbm numeric,
    package_count integer,
    pallet_count integer,
    pallet_type text,
    storage_start_date date,
    ready_for_collection boolean DEFAULT false NOT NULL,
    description text,
    ics_status text,
    ics_last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: checkin_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checkin_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    tenant_id uuid NOT NULL,
    is_walk_in boolean DEFAULT false NOT NULL,
    walk_in_purpose text,
    visit_person_name text,
    walk_in_reason text,
    licence_scan_method text,
    licence_name text,
    licence_number text,
    licence_dob text,
    licence_expiry text,
    licence_address text,
    name_match_result text DEFAULT 'not_checked'::text,
    name_match_score numeric,
    expiry_valid boolean,
    check_in_time timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    dismissed_by text
);


--
-- Name: drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_code text NOT NULL,
    driver_name text NOT NULL,
    license_class text,
    experience_years integer,
    assigned_truck_id uuid,
    status text DEFAULT 'off_duty'::text NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: kiosk_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kiosk_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    token text NOT NULL,
    label text,
    is_active boolean DEFAULT true NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: maintenance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    maintenance_code text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    activity_type text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    priority text DEFAULT 'medium'::text,
    due_date date,
    estimated_duration text,
    start_date date,
    estimated_completion date,
    completed_date date,
    progress_pct integer DEFAULT 0 NOT NULL,
    technician text,
    remarks text,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reference_id uuid
);


--
-- Name: planner_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planner_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    message text NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: planner_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planner_settings (
    user_id uuid NOT NULL,
    default_landing_page text DEFAULT 'vessels'::text NOT NULL,
    items_per_page integer DEFAULT 10 NOT NULL,
    show_completed_default boolean DEFAULT false NOT NULL,
    email_notifications jsonb DEFAULT '{"trip_completed": true, "trip_scheduled": true, "vessel_arrival": true}'::jsonb NOT NULL,
    system_notifications jsonb DEFAULT '{"trip_completed": true, "trip_scheduled": true, "vessel_arrival": true}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    vehicle_registration text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    block_reason text,
    app_user_id uuid
);


--
-- Name: service_request_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_request_id uuid NOT NULL,
    document_type text DEFAULT 'general'::text NOT NULL,
    filename text,
    file_size_bytes bigint,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_request_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_request_id uuid NOT NULL,
    service_key text NOT NULL,
    sub_type text,
    status text DEFAULT 'pending'::text NOT NULL,
    current_info text,
    duration_label text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id text NOT NULL,
    customer_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    service_category text NOT NULL,
    stage text DEFAULT 'received'::text NOT NULL,
    container_number text,
    container_type text,
    container_size text,
    vessel_line text,
    voyage_number text,
    collection_date date,
    terms_accepted boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text,
    logo_url text,
    working_hours jsonb DEFAULT '{}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    primary_color text,
    eft_bank_name text,
    eft_account_name text,
    eft_bsb text,
    eft_account_number text,
    compay_client_number text,
    address text,
    timezone text DEFAULT 'Australia/Sydney'::text,
    contact_email text,
    contact_phone text,
    stripe_public_key text,
    stripe_secret_key text,
    require_payment_to_confirm boolean DEFAULT false NOT NULL,
    storage_rate_per_cbm numeric DEFAULT 8.50,
    shrink_wrap_rate_per_pallet numeric DEFAULT 12.00,
    slot_fee_pickup numeric DEFAULT 5.00,
    slot_fee_dropoff numeric DEFAULT 5.00,
    slot_duration_min integer DEFAULT 60,
    max_bookings_per_slot integer DEFAULT 5,
    advance_booking_days integer DEFAULT 30,
    same_day_cutoff_time text,
    slot_hold_duration_min integer DEFAULT 10,
    slot_capacity_by_hour jsonb,
    slot_capacity_by_combo jsonb DEFAULT '{"pickup-fcl": 5, "pickup-lcl": 5, "dropoff-fcl": 5, "dropoff-lcl": 5}'::jsonb,
    cargowise_api_url text,
    cargowise_api_key text,
    cargowise_tenant_code text,
    cargowise_refresh_interval integer DEFAULT 30,
    smtp_host text,
    smtp_port integer DEFAULT 587,
    smtp_username text,
    smtp_password text,
    smtp_from_address text,
    smtp_from_name text,
    required_documents jsonb DEFAULT '[]'::jsonb,
    slot_capacity_matrix jsonb
);


--
-- Name: time_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    capacity integer DEFAULT 10 NOT NULL,
    confirmed integer DEFAULT 0 NOT NULL,
    held integer DEFAULT 0 NOT NULL,
    tenant_id uuid
);


--
-- Name: trailers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trailers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_code text NOT NULL,
    trailer_type text,
    capacity text,
    attached_truck_id uuid,
    status text DEFAULT 'available'::text NOT NULL,
    last_service_date date,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_ref text NOT NULL,
    service_category text NOT NULL,
    service_type text NOT NULL,
    container_number text,
    vessel_id uuid,
    vessel_name text,
    trip_date date,
    vehicle text,
    driver text,
    stage text DEFAULT 'planned'::text NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    priority text DEFAULT 'medium'::text,
    origin text,
    destination text,
    time_window_start time without time zone,
    time_window_end time without time zone,
    truck_id uuid,
    trailer_id uuid,
    driver_id uuid
);


--
-- Name: trucks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trucks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resource_code text NOT NULL,
    truck_type text,
    capacity text,
    location text,
    status text DEFAULT 'available'::text NOT NULL,
    last_service_date date,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vessels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vessels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vessel_name text NOT NULL,
    vessel_code text NOT NULL,
    eta timestamp with time zone,
    port text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    container_count integer DEFAULT 0 NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: visit_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_reasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visit_reasons_category_check CHECK ((category = ANY (ARRAY['office'::text, 'yard'::text])))
);


--
-- Name: visitable_persons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitable_persons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: walk_ins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.walk_ins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    purpose text NOT NULL,
    visitor_name text NOT NULL,
    contact_number text,
    person_being_visited text,
    reason text,
    arrived_at timestamp with time zone DEFAULT now() NOT NULL,
    licence_captured boolean DEFAULT false NOT NULL,
    dismissed boolean DEFAULT false NOT NULL,
    dismissed_at timestamp with time zone
);


--
-- Name: wizard_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wizard_drafts (
    token text NOT NULL,
    state jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: wizard_funnel_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wizard_funnel_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    session_id text NOT NULL,
    step integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: allocator_activity allocator_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocator_activity
    ADD CONSTRAINT allocator_activity_pkey PRIMARY KEY (id);


--
-- Name: allocator_settings allocator_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocator_settings
    ADD CONSTRAINT allocator_settings_pkey PRIMARY KEY (user_id);


--
-- Name: app_users app_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_email_key UNIQUE (email);


--
-- Name: app_users app_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (id);


--
-- Name: booking_documents booking_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_documents
    ADD CONSTRAINT booking_documents_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_reference_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_reference_number_key UNIQUE (reference_number);


--
-- Name: broadcast_templates broadcast_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcast_templates
    ADD CONSTRAINT broadcast_templates_pkey PRIMARY KEY (id);


--
-- Name: broadcasts broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_pkey PRIMARY KEY (id);


--
-- Name: carrier_profiles carrier_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_profiles
    ADD CONSTRAINT carrier_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: carriers carriers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carriers
    ADD CONSTRAINT carriers_pkey PRIMARY KEY (id);


--
-- Name: cfs_shipments cfs_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cfs_shipments
    ADD CONSTRAINT cfs_shipments_pkey PRIMARY KEY (id);


--
-- Name: checkin_records checkin_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_records
    ADD CONSTRAINT checkin_records_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_resource_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_resource_code_key UNIQUE (resource_code);


--
-- Name: kiosk_devices kiosk_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiosk_devices
    ADD CONSTRAINT kiosk_devices_pkey PRIMARY KEY (id);


--
-- Name: kiosk_devices kiosk_devices_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiosk_devices
    ADD CONSTRAINT kiosk_devices_token_key UNIQUE (token);


--
-- Name: maintenance_records maintenance_records_maintenance_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_records
    ADD CONSTRAINT maintenance_records_maintenance_code_key UNIQUE (maintenance_code);


--
-- Name: maintenance_records maintenance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_records
    ADD CONSTRAINT maintenance_records_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: planner_activity planner_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planner_activity
    ADD CONSTRAINT planner_activity_pkey PRIMARY KEY (id);


--
-- Name: planner_settings planner_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planner_settings
    ADD CONSTRAINT planner_settings_pkey PRIMARY KEY (user_id);


--
-- Name: saved_drivers saved_drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_drivers
    ADD CONSTRAINT saved_drivers_pkey PRIMARY KEY (id);


--
-- Name: saved_drivers saved_drivers_tenant_id_vehicle_registration_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_drivers
    ADD CONSTRAINT saved_drivers_tenant_id_vehicle_registration_key UNIQUE (tenant_id, vehicle_registration);


--
-- Name: service_request_documents service_request_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_documents
    ADD CONSTRAINT service_request_documents_pkey PRIMARY KEY (id);


--
-- Name: service_request_services service_request_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_services
    ADD CONSTRAINT service_request_services_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_request_id_key UNIQUE (request_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: time_slots time_slots_date_start_time_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_slots
    ADD CONSTRAINT time_slots_date_start_time_tenant_id_key UNIQUE (date, start_time, tenant_id);


--
-- Name: time_slots time_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_slots
    ADD CONSTRAINT time_slots_pkey PRIMARY KEY (id);


--
-- Name: trailers trailers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trailers
    ADD CONSTRAINT trailers_pkey PRIMARY KEY (id);


--
-- Name: trailers trailers_resource_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trailers
    ADD CONSTRAINT trailers_resource_code_key UNIQUE (resource_code);


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);


--
-- Name: trips trips_trip_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_trip_ref_key UNIQUE (trip_ref);


--
-- Name: trucks trucks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT trucks_pkey PRIMARY KEY (id);


--
-- Name: trucks trucks_resource_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT trucks_resource_code_key UNIQUE (resource_code);


--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);


--
-- Name: vessels vessels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_pkey PRIMARY KEY (id);


--
-- Name: vessels vessels_vessel_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_vessel_code_key UNIQUE (vessel_code);


--
-- Name: visit_reasons visit_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_reasons
    ADD CONSTRAINT visit_reasons_pkey PRIMARY KEY (id);


--
-- Name: visitable_persons visitable_persons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitable_persons
    ADD CONSTRAINT visitable_persons_pkey PRIMARY KEY (id);


--
-- Name: walk_ins walk_ins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walk_ins
    ADD CONSTRAINT walk_ins_pkey PRIMARY KEY (id);


--
-- Name: wizard_drafts wizard_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wizard_drafts
    ADD CONSTRAINT wizard_drafts_pkey PRIMARY KEY (token);


--
-- Name: wizard_funnel_events wizard_funnel_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wizard_funnel_events
    ADD CONSTRAINT wizard_funnel_events_pkey PRIMARY KEY (id);


--
-- Name: bc_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bc_tenant ON public.broadcasts USING btree (tenant_id);


--
-- Name: bct_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bct_tenant ON public.broadcast_templates USING btree (tenant_id);


--
-- Name: carriers_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carriers_tenant_idx ON public.carriers USING btree (tenant_id);


--
-- Name: idx_allocator_activity_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allocator_activity_created_at ON public.allocator_activity USING btree (created_at);


--
-- Name: idx_allocator_activity_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allocator_activity_tenant_id ON public.allocator_activity USING btree (tenant_id);


--
-- Name: idx_booking_documents_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_documents_booking_id ON public.booking_documents USING btree (booking_id);


--
-- Name: idx_bookings_group_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_group_ref ON public.bookings USING btree (group_reference);


--
-- Name: idx_bookings_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_reference ON public.bookings USING btree (reference_number);


--
-- Name: idx_bookings_slot_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_slot_date ON public.bookings USING btree (slot_date);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_bookings_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_tenant_id ON public.bookings USING btree (tenant_id);


--
-- Name: idx_cfs_shipments_hbl; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cfs_shipments_hbl ON public.cfs_shipments USING btree (house_bill_number);


--
-- Name: idx_cfs_shipments_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cfs_shipments_tenant_id ON public.cfs_shipments USING btree (tenant_id);


--
-- Name: idx_checkin_records_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checkin_records_booking_id ON public.checkin_records USING btree (booking_id);


--
-- Name: idx_checkin_records_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checkin_records_tenant_id ON public.checkin_records USING btree (tenant_id);


--
-- Name: idx_drivers_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_assigned ON public.drivers USING btree (assigned_truck_id);


--
-- Name: idx_drivers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_status ON public.drivers USING btree (status);


--
-- Name: idx_drivers_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drivers_tenant_id ON public.drivers USING btree (tenant_id);


--
-- Name: idx_maintenance_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_resource ON public.maintenance_records USING btree (resource_type, resource_id);


--
-- Name: idx_maintenance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_status ON public.maintenance_records USING btree (status);


--
-- Name: idx_maintenance_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_tenant_id ON public.maintenance_records USING btree (tenant_id);


--
-- Name: idx_planner_activity_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planner_activity_created_at ON public.planner_activity USING btree (created_at);


--
-- Name: idx_planner_activity_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_planner_activity_tenant_id ON public.planner_activity USING btree (tenant_id);


--
-- Name: idx_saved_drivers_app_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_drivers_app_user_id ON public.saved_drivers USING btree (app_user_id);


--
-- Name: idx_saved_drivers_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_drivers_tenant_id ON public.saved_drivers USING btree (tenant_id);


--
-- Name: idx_service_requests_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_category ON public.service_requests USING btree (service_category);


--
-- Name: idx_service_requests_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_customer_id ON public.service_requests USING btree (customer_id);


--
-- Name: idx_service_requests_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_request_id ON public.service_requests USING btree (request_id);


--
-- Name: idx_service_requests_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_stage ON public.service_requests USING btree (stage);


--
-- Name: idx_service_requests_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_tenant_id ON public.service_requests USING btree (tenant_id);


--
-- Name: idx_sr_documents_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sr_documents_request_id ON public.service_request_documents USING btree (service_request_id);


--
-- Name: idx_sr_services_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sr_services_request_id ON public.service_request_services USING btree (service_request_id);


--
-- Name: idx_trailers_attached; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trailers_attached ON public.trailers USING btree (attached_truck_id);


--
-- Name: idx_trailers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trailers_status ON public.trailers USING btree (status);


--
-- Name: idx_trailers_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trailers_tenant_id ON public.trailers USING btree (tenant_id);


--
-- Name: idx_trips_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trips_category ON public.trips USING btree (service_category);


--
-- Name: idx_trips_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trips_driver_id ON public.trips USING btree (driver_id);


--
-- Name: idx_trips_service_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trips_service_type ON public.trips USING btree (service_type);


--
-- Name: idx_trips_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trips_stage ON public.trips USING btree (stage);


--
-- Name: idx_trips_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trips_tenant_id ON public.trips USING btree (tenant_id);


--
-- Name: idx_trips_truck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trips_truck_id ON public.trips USING btree (truck_id);


--
-- Name: idx_trucks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trucks_status ON public.trucks USING btree (status);


--
-- Name: idx_trucks_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trucks_tenant_id ON public.trucks USING btree (tenant_id);


--
-- Name: idx_user_notifications_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notifications_user_read ON public.user_notifications USING btree (user_id, read, created_at DESC);


--
-- Name: idx_vessels_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vessels_status ON public.vessels USING btree (status);


--
-- Name: idx_vessels_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vessels_tenant_id ON public.vessels USING btree (tenant_id);


--
-- Name: idx_visit_reasons_tenant_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visit_reasons_tenant_category ON public.visit_reasons USING btree (tenant_id, category);


--
-- Name: idx_visitable_persons_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitable_persons_tenant_id ON public.visitable_persons USING btree (tenant_id);


--
-- Name: idx_walk_ins_dismissed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_walk_ins_dismissed ON public.walk_ins USING btree (dismissed);


--
-- Name: idx_walk_ins_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_walk_ins_tenant_id ON public.walk_ins USING btree (tenant_id);


--
-- Name: notif_tenant_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notif_tenant_read ON public.notifications USING btree (tenant_id, read, created_at DESC);


--
-- Name: wd_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wd_expires ON public.wizard_drafts USING btree (expires_at);


--
-- Name: wfe_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wfe_session ON public.wizard_funnel_events USING btree (session_id);


--
-- Name: wfe_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wfe_tenant_created ON public.wizard_funnel_events USING btree (tenant_id, created_at);


--
-- Name: allocator_activity allocator_activity_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocator_activity
    ADD CONSTRAINT allocator_activity_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: allocator_activity allocator_activity_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocator_activity
    ADD CONSTRAINT allocator_activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: allocator_settings allocator_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allocator_settings
    ADD CONSTRAINT allocator_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: booking_documents booking_documents_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_documents
    ADD CONSTRAINT booking_documents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: bookings bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


--
-- Name: broadcasts broadcasts_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.broadcasts
    ADD CONSTRAINT broadcasts_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.broadcast_templates(id) ON DELETE SET NULL;


--
-- Name: carrier_profiles carrier_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carrier_profiles
    ADD CONSTRAINT carrier_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: cfs_shipments cfs_shipments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cfs_shipments
    ADD CONSTRAINT cfs_shipments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: checkin_records checkin_records_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_records
    ADD CONSTRAINT checkin_records_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: checkin_records checkin_records_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checkin_records
    ADD CONSTRAINT checkin_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: drivers drivers_assigned_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_assigned_truck_id_fkey FOREIGN KEY (assigned_truck_id) REFERENCES public.trucks(id);


--
-- Name: drivers drivers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: drivers drivers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: kiosk_devices kiosk_devices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiosk_devices
    ADD CONSTRAINT kiosk_devices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: maintenance_records maintenance_records_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_records
    ADD CONSTRAINT maintenance_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: maintenance_records maintenance_records_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_records
    ADD CONSTRAINT maintenance_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: planner_activity planner_activity_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planner_activity
    ADD CONSTRAINT planner_activity_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: planner_activity planner_activity_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planner_activity
    ADD CONSTRAINT planner_activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: planner_settings planner_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planner_settings
    ADD CONSTRAINT planner_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: service_request_documents service_request_documents_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_documents
    ADD CONSTRAINT service_request_documents_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_request_services service_request_services_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_services
    ADD CONSTRAINT service_request_services_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_requests service_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.app_users(id);


--
-- Name: service_requests service_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: time_slots time_slots_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_slots
    ADD CONSTRAINT time_slots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: trailers trailers_attached_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trailers
    ADD CONSTRAINT trailers_attached_truck_id_fkey FOREIGN KEY (attached_truck_id) REFERENCES public.trucks(id);


--
-- Name: trailers trailers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trailers
    ADD CONSTRAINT trailers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: trailers trailers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trailers
    ADD CONSTRAINT trailers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: trips trips_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: trips trips_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- Name: trips trips_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: trips trips_trailer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_trailer_id_fkey FOREIGN KEY (trailer_id) REFERENCES public.trailers(id);


--
-- Name: trips trips_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id);


--
-- Name: trips trips_vessel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id);


--
-- Name: trucks trucks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT trucks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: trucks trucks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT trucks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: user_notifications user_notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: user_notifications user_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;


--
-- Name: vessels vessels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id);


--
-- Name: vessels vessels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: visit_reasons visit_reasons_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_reasons
    ADD CONSTRAINT visit_reasons_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: visitable_persons visitable_persons_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitable_persons
    ADD CONSTRAINT visitable_persons_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: walk_ins walk_ins_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.walk_ins
    ADD CONSTRAINT walk_ins_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- PostgreSQL database dump complete
--

\unrestrict P8d0bpv8cH0hqezQ6ejYkbcxwChDjEcCUHomFeiQUw6BDbcrY7mSvFLEDmsgZir

