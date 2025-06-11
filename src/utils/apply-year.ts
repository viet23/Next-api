import { formatDateTime } from '@common/constants/customer'
import moment from 'moment-timezone'

export function applyDateYear(year) {
  const startYear = moment(`${year}-01-01`).startOf('year').format(formatDateTime)
  const endYear = moment(`${year}-12-31`).endOf('year').format(formatDateTime)
  return { startYear, endYear }
}
