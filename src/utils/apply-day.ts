import { formatDateTime } from '@common/constants/customer'
import moment from 'moment-timezone'

export function applyDayTime(date) {
  const startOfDay = moment(date).startOf('day').format(formatDateTime)
  const endOfDay = moment(date).endOf('day').format(formatDateTime)
  return { startOfDay, endOfDay }
}
