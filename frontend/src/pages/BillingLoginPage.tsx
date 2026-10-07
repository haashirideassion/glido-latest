import ModuleLogin from '@/components/ModuleLogin'

/** Billing's own sign-in. Only the 'billing' role signs in here. */
export default function BillingLoginPage() {
  return (
    <ModuleLogin
      title="Billing Login"
      subtitle="Enter your credentials to access the billing dashboard — invoices, receivables, payments and revenue."
      placeholder="billing@glido.com"
      cta="Sign in to Billing →"
      allowedRoles={['billing']}
      homePath="/billing"
      redirectPattern={/^\/billing(\/|$)/}
    />
  )
}
