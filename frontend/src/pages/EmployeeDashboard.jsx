import { useParams, useSearchParams } from 'react-router-dom'
import Dashboard from './Dashboard'

export default function EmployeeDashboard() {
  const { userId } = useParams()
  const [searchParams] = useSearchParams()
  const name = searchParams.get('name') || 'This employee'

  return <Dashboard targetUserId={userId} targetUserName={name} />
}