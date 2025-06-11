import { formatDateTime } from '@common/constants/customer'
import { one } from '@common/constants/report'

export function applyEndDate(startDate: moment.Moment, endDate: moment.Moment) {
  const startMonth = startDate.month()
  const startYear = startDate.year()
  const endMonth = endDate.month()
  const endYear = endDate.year()
  // Kiểm tra nếu endMonth là tháng kế tiếp của startMonth
  const isNextMonth =
    endMonth === (startMonth + one) % 12 && endYear === (startMonth === 11 ? startYear + one : startYear)
  if (isNextMonth) {
    const endOfMonth = startDate.clone().endOf('month').endOf('day').format(formatDateTime)
    return endOfMonth
  }
  return endDate.format(formatDateTime)
}
