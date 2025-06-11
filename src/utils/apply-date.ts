import { formatDateTime, timeSubtract, timezone } from '@common/constants/customer'
import { one } from '@common/constants/report'
import moment from 'moment-timezone'

export function applyDate(filterStartDate, filterEndDate) {
  const startDate = moment(filterStartDate).tz(timezone).startOf('day').subtract(timeSubtract, 'hours')
  const endDate = moment(filterEndDate).tz(timezone).endOf('day').subtract(timeSubtract, 'hours')
  const startOfMonth = moment(filterStartDate)
    .clone()
    .startOf('month')
    .startOf('day')
    .subtract(timeSubtract, 'hours')
    .format(formatDateTime)

  const startMonth = moment(filterStartDate).month()
  const startYear = moment(filterStartDate).year()
  const endMonth = moment(filterEndDate).month()
  const endYear = moment(filterEndDate).year()
  // Kiểm tra nếu endMonth là tháng kế tiếp của startMonth
  const isNextMonth =
    endMonth === (startMonth + one) % 12 && endYear === (startMonth === 11 ? startYear + one : startYear)
  if (isNextMonth) {
    const endOfMonth = startDate
      .clone()
      .endOf('month')
      .endOf('day')
      .subtract(timeSubtract, 'hours')
      .format(formatDateTime)
    return { startDate, endDate, startOfMonth, endOfMonth }
  }
  return { startDate, endDate, startOfMonth, endOfMonth: endDate.format(formatDateTime) }
}
