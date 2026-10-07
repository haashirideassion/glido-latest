import ModuleLogin from '@/components/ModuleLogin'

/** Packing & Unpacking's own sign-in. Only the 'packing' role signs in here. */
export default function PackingLoginPage() {
  return (
    <ModuleLogin
      title="Packing & Unpacking Login"
      subtitle="Enter your credentials to access the Packing & Unpacking module — requests, planning and job results."
      placeholder="packing@glido.com"
      cta="Sign in to Packing & Unpacking →"
      allowedRoles={['packing']}
      homePath="/packing-unpacking"
      redirectPattern={/^\/packing-unpacking(\/|$)/}
    />
  )
}
