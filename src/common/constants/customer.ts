import * as path from 'path'
export const COLUMNS = {
  A: 'STT',
  B: 'Họ Tên',
  C: 'Năm Sinh',
  D: 'SĐT',
  E: 'Email',
  F: 'Giới Tính',
}

export const CREDIT = 'creditor_customer_id'
export const DEBIT = 'debitor_customer_id'
export const CREDIT_REF = 'creditor_ref_id'
export const DEBIT_REF = 'debitor_ref_id'
export const templateDir = './dist/templates/customer-template.xlsx' //'./src/templates/customer-template.xlsx'
export const formatDate = 'YYYY-MM-DD'
export const formatTicketDate = "DD/MM/YY"; 
export const formatDateTime = 'YYYY-MM-DD HH:mm:ss'
export const timezone = 'Asia/Ho_Chi_Minh'
export const timeSubtract = 7
export const individualCustomerType = '01'
export const ROW_INDEX = 2
export const templateTicket = './dist/templates/ticket-template.xlsx'
export const reportTicketYear = './dist/templates/report-ticket-year.xlsx'
export const reportTicketMonth = './dist/templates/report-ticket-month.xlsx'
export const reportReceptionTicketYear = './dist/templates/report-ticket-reception-year.xlsx'
export const reportReceptionTicketMonth = './dist/templates/report-ticket-reception-month.xlsx'

export const templateReportUser = './dist/templates/report-template.xlsx'
export const templateReportStateBank = './dist/templates/report_state_bank.xlsx'
export const statusOnline = 25

export enum GenderEnum {
  MALE = 'Nam',
  FEMALE = 'Nữ',
  OTHER = 'OTHER',
}
