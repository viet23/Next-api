import { zero } from '../common/constants/report'

export function calculatePercentage(part, total) {
  if (!part || !total || part == null || total == null || total == zero || part == zero) return zero.toString()
  return ((part / total) * 100).toFixed(2)
}
