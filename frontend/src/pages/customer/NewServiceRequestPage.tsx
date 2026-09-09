import { Navigate } from 'react-router-dom'
import { usePageTitle } from '@/lib/usePageTitle'
import { ServiceRequestWizardProvider } from '@/contexts/ServiceRequestWizardContext'
import ServiceRequestWizard from '@/components/customer/ServiceRequestWizard'
import { useCustomerPermissions } from '@/lib/useCustomerPermissions'

export default function NewServiceRequestPage() {
  usePageTitle('Glido | New Service Request')
  const perms = useCustomerPermissions()
  if (!perms.can_create_service_request) return <Navigate to="/customer" replace />
  return (
    <ServiceRequestWizardProvider>
      <ServiceRequestWizard />
    </ServiceRequestWizardProvider>
  )
}
