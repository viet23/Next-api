import { zero } from '../common/constants/report'

export function average(part, total) {
  if (!part || !total || part == null || total == null || total == zero || part == zero) return zero.toString()
  return (part / total).toFixed(2)
}
