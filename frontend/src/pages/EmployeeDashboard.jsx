import { useParams, useSearchParams } from 'react-router-dom'
import Dashboard from './Dashboard'

export default function EmployeeDashboard() {
  const { userId } = useParams()
  const [searchParams] = useSearchParams()
  const name = searchParams.get('name') || 'This employee'
  // ✅ Set when arriving from Team Overview's "View Pending" link — scopes
  // this employee's dashboard down to just their unfinished shipments.
  const pendingOnly = searchParams.get('pendingOnly') === 'true'

  return <Dashboard targetUserId={userId} targetUserName={name} pendingOnly={pendingOnly} />
}