import { createBrowserRouter, Navigate } from 'react-router-dom'
import PublicLayout    from './layouts/PublicLayout'
import ReceptionLayout from './layouts/ReceptionLayout'
import LandingPage     from './pages/LandingPage'
import BookPage         from './pages/BookPage'
import MyBookingsPage    from './pages/MyBookingsPage'
import VisitorLoginPage  from './pages/VisitorLoginPage'
import CustomerLoginPage from './pages/CustomerLoginPage'
import StaffLoginPage    from './pages/StaffLoginPage'
import DashboardPage   from './pages/reception/DashboardPage'
import BookingsPage    from './pages/reception/BookingsPage'
import WalkInsPage     from './pages/reception/WalkInsPage'
import ReportsPage      from './pages/reception/ReportsPage'
import VisitorLogPage      from './pages/reception/VisitorLogPage'
import ReportsConfigPage   from './pages/reception/ReportsConfigPage'
import AnalyticsPage        from './pages/reception/AnalyticsPage'
import SettingsPage        from './pages/reception/SettingsPage'
import CarriersPage       from './pages/reception/CarriersPage'
import BroadcastPage      from './pages/reception/BroadcastPage'
import BookingDetailPage   from './pages/reception/BookingDetailPage'
import VisitorDetailPage  from './pages/reception/VisitorDetailPage'
import NewBookingPage  from './pages/reception/NewBookingPage'
import ProfilePage        from './pages/ProfilePage'
import SavedDriversPage     from './pages/SavedDriversPage'
import SetupPasswordPage   from './pages/SetupPasswordPage'
import KioskPage       from './pages/KioskPage'
import ModulesPage     from './pages/ModulesPage'
import NotFound        from './pages/NotFound'
import ReceptionGuard  from './components/ReceptionGuard'
import SuperAdminGuard  from './components/SuperAdminGuard'
import SuperAdminLayout from './layouts/SuperAdminLayout'
import AdminIntegrationsPage from './pages/admin/AdminIntegrationsPage'
import AdminAccessPage         from './pages/admin/AdminAccessPage'
import CustomerGuard         from './components/CustomerGuard'
import CustomerPortalLayout  from './layouts/CustomerPortalLayout'
import CustomerDashboardPage    from './pages/customer/CustomerDashboardPage'
import MyRequestsPage           from './pages/customer/MyRequestsPage'
import NewServiceRequestPage    from './pages/customer/NewServiceRequestPage'
import CustomerReportsPage      from './pages/customer/CustomerReportsPage'
import CustomerSettingsPage     from './pages/customer/CustomerSettingsPage'
import PlannerGuard          from './components/PlannerGuard'
import PlannerLayout         from './layouts/PlannerLayout'
import PlannerDashboardPage     from './pages/planner/PlannerDashboardPage'
import VesselsPage               from './pages/planner/VesselsPage'
import TripsPage                 from './pages/planner/TripsPage'
import PlannerSettingsPage       from './pages/planner/PlannerSettingsPage'
import PlannerReportsPage        from './pages/planner/PlannerReportsPage'
import AllocatorGuard        from './components/AllocatorGuard'
import AllocatorLayout       from './layouts/AllocatorLayout'
import AllocatorDashboardPage    from './pages/allocator/AllocatorDashboardPage'
import ResourceManagementPage    from './pages/allocator/ResourceManagementPage'
import TripAllocationPage        from './pages/allocator/TripAllocationPage'
import MaintenanceManagementPage from './pages/allocator/MaintenanceManagementPage'
import AllocatorSettingsPage     from './pages/allocator/AllocatorSettingsPage'
import BillingGuard          from './components/BillingGuard'
import BillingLayout         from './layouts/BillingLayout'
import BillingDashboardPage     from './pages/billing/BillingDashboardPage'
import BillingWorkbenchPage     from './pages/billing/BillingWorkbenchPage'
import InvoicesPage             from './pages/billing/InvoicesPage'
import InvoiceDetailPage        from './pages/billing/InvoiceDetailPage'
import ReceivablesPage          from './pages/billing/ReceivablesPage'
import AccountDetailPage        from './pages/billing/AccountDetailPage'
import PaymentsPage             from './pages/billing/PaymentsPage'
import BillingReportsPage       from './pages/billing/BillingReportsPage'
import BillingSettingsPage      from './pages/billing/BillingSettingsPage'
import ComplianceGuard          from './components/ComplianceGuard'
import ComplianceLayout         from './layouts/ComplianceLayout'
import ComplianceDashboardPage     from './pages/compliance/ComplianceDashboardPage'
import MyActivitiesPage            from './pages/compliance/MyActivitiesPage'
import CompletedActivitiesPage     from './pages/compliance/CompletedActivitiesPage'
import SiteInspectionPage          from './pages/compliance/SiteInspectionPage'

export const router = createBrowserRouter([
  {
    /* Public — shared nav + footer */
    element: <PublicLayout />,
    children: [
      { path: '/',              element: <LandingPage /> },
      { path: '/login',         element: <StaffLoginPage /> },
      { path: '/visitor-login', element: <VisitorLoginPage /> },
      { path: '/customer-login', element: <CustomerLoginPage /> },
      { path: '/bookings',      element: <MyBookingsPage /> },
      { path: '/book',          element: <BookPage /> },
      { path: '/modules',       element: <ModulesPage /> },
      { path: '/profile',       element: <ProfilePage /> },
      { path: '/drivers',         element: <SavedDriversPage /> },
      { path: '/setup-password',  element: <SetupPasswordPage /> },
    ],
  },
  {
    /* Reception — guarded */
    path: '/reception',
    element: <ReceptionGuard />,
    children: [
      {
        element: <ReceptionLayout />,
        children: [
          { index: true,                                   element: <DashboardPage /> },
          { path: 'bookings',                              element: <BookingsPage /> },
          { path: 'bookings/new',                          element: <NewBookingPage /> },
          { path: 'bookings/:id',                          element: <BookingDetailPage /> },
          { path: 'bookings/group/:groupRef',              element: <BookingDetailPage /> },
          { path: 'visitors',                              element: <WalkInsPage /> },
          { path: 'visitors/:id',                          element: <VisitorDetailPage /> },
          { path: 'reports',                               element: <ReportsPage /> },
          { path: 'reports/visitor-log',                   element: <VisitorLogPage /> },
          { path: 'reports/configure',                     element: <ReportsConfigPage /> },
          { path: 'reports/analytics',                     element: <AnalyticsPage /> },
          { path: 'reports/activity',                      element: <ReportsPage /> },
          { path: 'settings',                              element: <SettingsPage /> },
          { path: 'carriers',                              element: <CarriersPage /> },
          { path: 'broadcast',                             element: <BroadcastPage /> },
        ],
      },
    ],
  },
  {
    /* Super Admin — independent module, own layout, gated to super_admin */
    path: '/superadmin',
    element: <SuperAdminGuard />,
    children: [
      {
        element: <SuperAdminLayout />,
        children: [
          { index: true,           element: <Navigate to="/superadmin/settings#general" replace /> },
          { path: 'settings',      element: <SettingsPage /> },
          { path: 'access',        element: <AdminAccessPage /> },
          { path: 'integrations',  element: <AdminIntegrationsPage /> },
        ],
      },
    ],
  },
  {
    /* Customer Portal — guarded, Phase 2 */
    path: '/customer',
    element: <CustomerGuard />,
    children: [
      {
        element: <CustomerPortalLayout />,
        children: [
          { index: true,           element: <CustomerDashboardPage /> },
          { path: 'requests',      element: <MyRequestsPage /> },
          { path: 'requests/new',  element: <NewServiceRequestPage /> },
          { path: 'reports',       element: <CustomerReportsPage /> },
          { path: 'settings',      element: <CustomerSettingsPage /> },
        ],
      },
    ],
  },
  {
    /* Planner Module — guarded, Phase 2 */
    path: '/planner',
    element: <PlannerGuard />,
    children: [
      {
        element: <PlannerLayout />,
        children: [
          { index: true,      element: <PlannerDashboardPage /> },
          { path: 'vessels',  element: <VesselsPage /> },
          { path: 'trips',    element: <TripsPage /> },
          { path: 'settings', element: <PlannerSettingsPage /> },
          { path: 'reports',  element: <PlannerReportsPage /> },
        ],
      },
    ],
  },
  {
    /* Allocator Module — guarded, Phase 2 */
    path: '/allocator',
    element: <AllocatorGuard />,
    children: [
      {
        element: <AllocatorLayout />,
        children: [
          { index: true,        element: <AllocatorDashboardPage /> },
          { path: 'resources',  element: <ResourceManagementPage /> },
          { path: 'trips',      element: <TripAllocationPage /> },
          { path: 'maintenance', element: <MaintenanceManagementPage /> },
          { path: 'settings',   element: <AllocatorSettingsPage /> },
        ],
      },
    ],
  },
  {
    /* Billing, Rating & Revenue Module — guarded. Implements the FRS v0.2 §5.1
       chain: catalogue → tariff → rating → charge line → invoice → payment →
       report. Customer-facing surfaces (X-01…X-09) live in the booking wizard
       and the visitor portal, not here. */
    path: '/billing',
    element: <BillingGuard />,
    children: [
      {
        element: <BillingLayout />,
        children: [
          { index: true,                          element: <BillingDashboardPage /> },
          { path: 'workbench',                    element: <BillingWorkbenchPage /> },
          { path: 'invoices',                     element: <InvoicesPage /> },
          { path: 'invoices/:id',                 element: <InvoiceDetailPage /> },
          { path: 'receivables',                  element: <ReceivablesPage /> },
          { path: 'receivables/accounts/:id',     element: <AccountDetailPage /> },
          { path: 'payments',                     element: <PaymentsPage /> },
          { path: 'reports',                      element: <BillingReportsPage /> },
          { path: 'settings',                     element: <BillingSettingsPage /> },
        ],
      },
    ],
  },
  {
    /* Compliance Module — guarded, Phase 2 (FRD 2.4.4) */
    path: '/compliance',
    element: <ComplianceGuard />,
    children: [
      {
        element: <ComplianceLayout />,
        children: [
          { index: true,        element: <ComplianceDashboardPage /> },
          { path: 'activities', element: <MyActivitiesPage /> },
          { path: 'completed',  element: <CompletedActivitiesPage /> },
          { path: 'inspections', element: <SiteInspectionPage /> },
        ],
      },
    ],
  },
  {
    /* Kiosk — fullscreen standalone */
    path: '/kiosk',
    element: <KioskPage />,
  },
  {
    /* 404 catch-all */
    path: '*',
    element: <NotFound />,
  },
])
