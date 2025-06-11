import { formatDateTime } from '@common/constants/customer'
import moment from 'moment-timezone'

export function applyDateMonth(year, month) {
  const startMonth = moment(`${year}-${month}`, 'YYYY-MM').startOf('month').format(formatDateTime)
  const endMonth = moment(`${year}-${month}`, 'YYYY-MM').endOf('month').format(formatDateTime)
  return { startMonth, endMonth }
}
