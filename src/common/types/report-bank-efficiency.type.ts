export type BankEfficiencyType = {
  count: string //Số lượt thực hiện liên kết
  userTotal: string //Số user thực hiện liên kết
  countSuccess: string //Số user thực hiện liên kết
  countFail: string //Số lượt thực hiện thất bại
  average: string //Trb số lượt/user liên kết
  averageCancel: string //Trb số lượt/user hủy
  percentageSuccess: string
  percentageFail: string
  countCancelInPeriod: string //Số lượt liên kết trong kỳ BC, huỷ kỳ BC
  userCancelInPeriod: string //Số user liên kết kỳ BC, huỷ kỳ BC
  countCancelBeforePeriod: string //Số lượt liên kết từ các kỳ trước, huỷ kỳ BC
  userCancelBeforePeriod: string //Số user liên kết từ các kỳ trước, huỷ kỳ BC
  cancelTolal: string // Số lượt thực hiện huỷ liên kết
  userCancelTolal: string //Số user thực hiện huỷ liên kết
  percentageCancelInPeriod: string
  percentageCancelBeforePeriod: string
  percentageUserCancelInPeriod: string
  percentageUserCancelBeforePeriod: string
}
