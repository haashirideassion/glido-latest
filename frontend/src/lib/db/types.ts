export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: { created_at: string; entity_id: string | null; entity_type: string | null; event_type: string; id: string; ip_address: unknown; new_value: Json | null; old_value: Json | null; tenant_id: string | null; user_agent: string | null; user_id: string | null }
        Insert: { created_at?: string; entity_id?: string | null; entity_type?: string | null; event_type: string; id?: string; ip_address?: unknown; new_value?: Json | null; old_value?: Json | null; tenant_id?: string | null; user_agent?: string | null; user_id?: string | null }
        Update: { created_at?: string; entity_id?: string | null; entity_type?: string | null; event_type?: string; id?: string; ip_address?: unknown; new_value?: Json | null; old_value?: Json | null; tenant_id?: string | null; user_agent?: string | null; user_id?: string | null }
        Relationships: []
      }
      booking_documents: {
        Row: { booking_id: string; container_extracted: string | null; document_type: string; file_size_bytes: number | null; filename: string; hbl_extracted: string | null; id: string; mime_type: string | null; storage_path: string; tenant_id: string; uploaded_at: string; validation_notes: string | null; validation_passed: boolean | null }
        Insert: { booking_id: string; container_extracted?: string | null; document_type?: string; file_size_bytes?: number | null; filename: string; hbl_extracted?: string | null; id?: string; mime_type?: string | null; storage_path: string; tenant_id: string; uploaded_at?: string; validation_notes?: string | null; validation_passed?: boolean | null }
        Update: { booking_id?: string; container_extracted?: string | null; document_type?: string; file_size_bytes?: number | null; filename?: string; hbl_extracted?: string | null; id?: string; mime_type?: string | null; storage_path?: string; tenant_id?: string; uploaded_at?: string; validation_notes?: string | null; validation_passed?: boolean | null }
        Relationships: []
      }
      bookings: {
        Row: {
          checked_in_at: string | null; completed_at: string | null; completed_by: string | null; completion_notes: string | null; container_number: string | null; created_at: string; do_final_lodgment: boolean | null; do_validated: boolean | null; driver_name: string; driver_phone: string | null; gst_amount: number | null; guest_name: string | null; guest_phone: string | null; house_bill_number: string | null; ics_last_checked_at: string | null; ics_status: string | null; id: string; load_type: string; package_count: number | null; pallet_count: number | null; pallet_type: string | null; payment_method: string | null; payment_status: string | null; reference_number: string; service_type: string; session_id: string | null; shrink_wrap_charge: number | null; slot_date: string; slot_end_time: string; slot_fee: number | null; slot_hold_until: string | null; slot_start_time: string; status: string; storage_charge: number | null; storage_days: number | null; storage_start_date: string | null; stripe_payment_intent_id: string | null; subtotal: number | null; tenant_id: string; total_amount: number | null; updated_at: string; user_id: string | null; volume_cbm: number | null; weight_kg: number | null
        }
        Insert: {
          checked_in_at?: string | null; completed_at?: string | null; completed_by?: string | null; completion_notes?: string | null; container_number?: string | null; created_at?: string; do_final_lodgment?: boolean | null; do_validated?: boolean | null; driver_name: string; driver_phone?: string | null; gst_amount?: number | null; guest_name?: string | null; guest_phone?: string | null; house_bill_number?: string | null; ics_last_checked_at?: string | null; ics_status?: string | null; id?: string; load_type: string; package_count?: number | null; pallet_count?: number | null; pallet_type?: string | null; payment_method?: string | null; payment_status?: string | null; reference_number: string; service_type: string; session_id?: string | null; shrink_wrap_charge?: number | null; slot_date: string; slot_end_time: string; slot_fee?: number | null; slot_hold_until?: string | null; slot_start_time: string; status?: string; storage_charge?: number | null; storage_days?: number | null; storage_start_date?: string | null; stripe_payment_intent_id?: string | null; subtotal?: number | null; tenant_id: string; total_amount?: number | null; updated_at?: string; user_id?: string | null; volume_cbm?: number | null; weight_kg?: number | null
        }
        Update: {
          checked_in_at?: string | null; completed_at?: string | null; completed_by?: string | null; completion_notes?: string | null; container_number?: string | null; created_at?: string; do_final_lodgment?: boolean | null; do_validated?: boolean | null; driver_name?: string; driver_phone?: string | null; gst_amount?: number | null; guest_name?: string | null; guest_phone?: string | null; house_bill_number?: string | null; ics_last_checked_at?: string | null; ics_status?: string | null; id?: string; load_type?: string; package_count?: number | null; pallet_count?: number | null; pallet_type?: string | null; payment_method?: string | null; payment_status?: string | null; reference_number?: string; service_type?: string; session_id?: string | null; shrink_wrap_charge?: number | null; slot_date?: string; slot_end_time?: string; slot_fee?: number | null; slot_hold_until?: string | null; slot_start_time?: string; status?: string; storage_charge?: number | null; storage_days?: number | null; storage_start_date?: string | null; stripe_payment_intent_id?: string | null; subtotal?: number | null; tenant_id?: string; total_amount?: number | null; updated_at?: string; user_id?: string | null; volume_cbm?: number | null; weight_kg?: number | null
        }
        Relationships: []
      }
      cfs_shipments: {
        Row: { container_number: string | null; description: string | null; house_bill_number: string; ics_last_checked_at: string | null; ics_status: string | null; id: string; imported_at: string; package_count: number | null; pallet_count: number | null; pallet_type: string | null; ready_for_collection: boolean; storage_start_date: string | null; tenant_id: string; volume_cbm: number | null; weight_kg: number | null }
        Insert: { container_number?: string | null; description?: string | null; house_bill_number: string; ics_last_checked_at?: string | null; ics_status?: string | null; id?: string; imported_at?: string; package_count?: number | null; pallet_count?: number | null; pallet_type?: string | null; ready_for_collection?: boolean; storage_start_date?: string | null; tenant_id: string; volume_cbm?: number | null; weight_kg?: number | null }
        Update: { container_number?: string | null; description?: string | null; house_bill_number?: string; ics_last_checked_at?: string | null; ics_status?: string | null; id?: string; imported_at?: string; package_count?: number | null; pallet_count?: number | null; pallet_type?: string | null; ready_for_collection?: boolean; storage_start_date?: string | null; tenant_id?: string; volume_cbm?: number | null; weight_kg?: number | null }
        Relationships: []
      }
      checkin_records: {
        Row: { booking_id: string | null; check_in_time: string; dismissed_at: string | null; dismissed_by: string | null; expiry_valid: boolean | null; id: string; is_walk_in: boolean; licence_address: string | null; licence_dob: string | null; licence_expiry: string | null; licence_name: string | null; licence_number: string | null; licence_scan_method: string | null; name_match_result: string | null; name_match_score: number | null; tenant_id: string; visit_person_name: string | null; walk_in_purpose: string | null; walk_in_reason: string | null }
        Insert: { booking_id?: string | null; check_in_time?: string; dismissed_at?: string | null; dismissed_by?: string | null; expiry_valid?: boolean | null; id?: string; is_walk_in?: boolean; licence_address?: string | null; licence_dob?: string | null; licence_expiry?: string | null; licence_name?: string | null; licence_number?: string | null; licence_scan_method?: string | null; name_match_result?: string | null; name_match_score?: number | null; tenant_id: string; visit_person_name?: string | null; walk_in_purpose?: string | null; walk_in_reason?: string | null }
        Update: { booking_id?: string | null; check_in_time?: string; dismissed_at?: string | null; dismissed_by?: string | null; expiry_valid?: boolean | null; id?: string; is_walk_in?: boolean; licence_address?: string | null; licence_dob?: string | null; licence_expiry?: string | null; licence_name?: string | null; licence_number?: string | null; licence_scan_method?: string | null; name_match_result?: string | null; name_match_score?: number | null; tenant_id?: string; visit_person_name?: string | null; walk_in_purpose?: string | null; walk_in_reason?: string | null }
        Relationships: []
      }
      tenants: {
        Row: { address: string | null; advance_booking_days: number; cargowise_api_key: string | null; cargowise_api_url: string | null; contact_email: string | null; contact_phone: string | null; created_at: string; currency: string | null; eft_account_name: string | null; eft_account_number: string | null; eft_bank_name: string | null; eft_bsb: string | null; gst_enabled: boolean; gst_rate: number; id: string; logo_url: string | null; max_bookings_per_slot: number; name: string; primary_color: string | null; public_holidays: string[] | null; require_payment_to_confirm: boolean; required_documents: Json; same_day_cutoff_time: string | null; shrink_wrap_rate_per_pallet: number; slot_duration_min: number; slot_fee_dropoff: number; slot_fee_pickup: number; slot_hold_duration_min: number; storage_free_days: number; storage_rate_per_cbm: number; stripe_public_key: string | null; stripe_secret_key: string | null; subdomain: string; timezone: string | null; updated_at: string; working_hours: Json }
        Insert: { address?: string | null; advance_booking_days?: number; cargowise_api_key?: string | null; cargowise_api_url?: string | null; contact_email?: string | null; contact_phone?: string | null; created_at?: string; currency?: string | null; eft_account_name?: string | null; eft_account_number?: string | null; eft_bank_name?: string | null; eft_bsb?: string | null; gst_enabled?: boolean; gst_rate?: number; id?: string; logo_url?: string | null; max_bookings_per_slot?: number; name: string; primary_color?: string | null; public_holidays?: string[] | null; require_payment_to_confirm?: boolean; required_documents?: Json; same_day_cutoff_time?: string | null; shrink_wrap_rate_per_pallet?: number; slot_duration_min?: number; slot_fee_dropoff?: number; slot_fee_pickup?: number; slot_hold_duration_min?: number; storage_free_days?: number; storage_rate_per_cbm?: number; stripe_public_key?: string | null; stripe_secret_key?: string | null; subdomain: string; timezone?: string | null; updated_at?: string; working_hours?: Json }
        Update: { address?: string | null; advance_booking_days?: number; cargowise_api_key?: string | null; cargowise_api_url?: string | null; contact_email?: string | null; contact_phone?: string | null; created_at?: string; currency?: string | null; eft_account_name?: string | null; eft_account_number?: string | null; eft_bank_name?: string | null; eft_bsb?: string | null; gst_enabled?: boolean; gst_rate?: number; id?: string; logo_url?: string | null; max_bookings_per_slot?: number; name?: string; primary_color?: string | null; public_holidays?: string[] | null; require_payment_to_confirm?: boolean; required_documents?: Json; same_day_cutoff_time?: string | null; shrink_wrap_rate_per_pallet?: number; slot_duration_min?: number; slot_fee_dropoff?: number; slot_fee_pickup?: number; slot_hold_duration_min?: number; storage_free_days?: number; storage_rate_per_cbm?: number; stripe_public_key?: string | null; stripe_secret_key?: string | null; subdomain?: string; timezone?: string | null; updated_at?: string; working_hours?: Json }
        Relationships: []
      }
      time_slots: {
        Row: { capacity: number; confirmed: number; created_at: string; date: string; end_time: string; held: number; id: string; start_time: string; tenant_id: string }
        Insert: { capacity?: number; confirmed?: number; created_at?: string; date: string; end_time: string; held?: number; id: string; start_time: string; tenant_id: string }
        Update: { capacity?: number; confirmed?: number; created_at?: string; date?: string; end_time?: string; held?: number; id?: string; start_time?: string; tenant_id?: string }
        Relationships: []
      }
      users: {
        Row: { company_name: string | null; created_at: string; email: string; first_name: string | null; id: string; is_active: boolean; last_login_at: string | null; last_name: string | null; phone: string | null; role: string; tenant_id: string | null; updated_at: string }
        Insert: { company_name?: string | null; created_at?: string; email: string; first_name?: string | null; id: string; is_active?: boolean; last_login_at?: string | null; last_name?: string | null; phone?: string | null; role?: string; tenant_id?: string | null; updated_at?: string }
        Update: { company_name?: string | null; created_at?: string; email?: string; first_name?: string | null; id?: string; is_active?: boolean; last_login_at?: string | null; last_name?: string | null; phone?: string | null; role?: string; tenant_id?: string | null; updated_at?: string }
        Relationships: []
      }
      walk_ins: {
        Row: { arrived_at: string; contact_number: string | null; created_at: string; dismissed: boolean; dismissed_at: string | null; id: string; licence_captured: boolean; person_being_visited: string | null; purpose: string; reason: string | null; tenant_id: string; visitor_name: string }
        Insert: { arrived_at?: string; contact_number?: string | null; created_at?: string; dismissed?: boolean; dismissed_at?: string | null; id?: string; licence_captured?: boolean; person_being_visited?: string | null; purpose: string; reason?: string | null; tenant_id: string; visitor_name: string }
        Update: { arrived_at?: string; contact_number?: string | null; created_at?: string; dismissed?: boolean; dismissed_at?: string | null; id?: string; licence_captured?: boolean; person_being_visited?: string | null; purpose?: string; reason?: string | null; tenant_id?: string; visitor_name?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
