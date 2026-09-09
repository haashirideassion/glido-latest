import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is a reception_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Check caller role
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const { data: callerRow } = await supabaseAdmin
      .from('users')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single()

    if (!callerRow || !['reception_admin', 'super_admin'].includes(callerRow.role)) {
      return new Response(JSON.stringify({ error: 'Only reception admins can invite users' }), { status: 403 })
    }

    // Parse request body
    const { email, role, firstName, lastName } = await req.json()
    if (!email || !role) {
      return new Response(JSON.stringify({ error: 'Email and role are required' }), { status: 400 })
    }

    if (!['reception_staff', 'reception_admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400 })
    }

    // Send invite via Supabase Auth
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        first_name: firstName ?? '',
        last_name: lastName ?? '',
        role: role,
      }
    })

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), { status: 400 })
    }

    // Insert into users table
    await supabaseAdmin.from('users').insert({
      id: inviteData.user.id,
      email: email,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      role: role,
      tenant_id: callerRow.tenant_id,
      is_active: true,
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
