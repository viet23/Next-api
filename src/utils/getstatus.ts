import { CaseStatusEnum, StatusMapping } from '@common/enums/case.enum'

export function getStatusEnum(value: string) {
  for (const [key, statuses] of Object.entries(StatusMapping)) {
    if (statuses.includes(value)) {
      return CaseStatusEnum[key as keyof typeof CaseStatusEnum]
    }
  }
  return undefined
}
