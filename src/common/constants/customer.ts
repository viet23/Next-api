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
export const formatTicketDate = 'DD/MM/YY'
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

// plan.schema.ts
export const TARGETING_PLAN_SCHEMA = {
  name: 'fb_targeting_plan',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      set_auto_placements: { type: 'boolean' },
      expand_audience: { type: 'boolean' }, // Advantage audience / targeting expansion
      add_interests: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name'],
          properties: {
            id: { type: 'string' }, // ưu tiên có id; nếu không có, chỉ name
            name: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      age_range: {
        type: 'object',
        properties: {
          min: { type: 'integer', minimum: 13, maximum: 65 },
          max: { type: 'integer', minimum: 13, maximum: 65 },
        },
        additionalProperties: false,
      },
      genders: { type: 'array', items: { type: 'integer', enum: [0, 1, 2] }, maxItems: 2 },
      locales: { type: 'array', items: { type: 'integer' }, maxItems: 8 },
      geo: {
        type: 'object',
        properties: {
          countries: { type: 'array', items: { type: 'string' } },
          regions: { type: 'array', items: { type: 'string' } },
          cities: { type: 'array', items: { type: 'string' } },
          location_types: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
      exclusions: { type: 'object' }, // giữ mở để FB chấp nhận
      budget: {
        type: 'object',
        properties: {
          increase_percent: { type: 'number', minimum: 0, maximum: 100 },
          set_daily_budget: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      },
      ab_test: {
        type: 'object',
        properties: {
          pause_old_ad: { type: 'boolean' },
          variants: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'primaryText'],
              properties: {
                name: { type: 'string' },
                primaryText: { type: 'string' },
                imageHash: { type: 'string' },
              },
              additionalProperties: false,
            },
            minItems: 1,
            maxItems: 4,
          },
        },
        additionalProperties: false,
      },
    },
    required: [],
  },
} as const
