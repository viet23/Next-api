export enum ReportTypeEnum {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
}

export enum ReportTypeTicketEnum {
  YEAR = 'YEAR',
  MONTH = 'MONTH',
}

export enum CustomerStatusEnum {
  ALL = 'allUser', //tổng user
  ONLINE = 'online', //Đang hoạt động
  OFFLINE = 'offline', //Chưa hoạt động
  AUTHEN_FAILED = 'authenFailed', // Xác thực thất bại
  VERIFIED = 'verified', //Đã xác thực
  CREATE_NEW = 'createNew', //Tạo mới
  LOCK = 'lock', // Khóa vĩnh viễn/Khóa tạm thời
  UNKNOWN = 'unknown', // Không xác định
}
export enum RowCustomerStatusEnum {
  ALL = 14,
  ONLINE = 15,
  OFFLINE = 16,
  CREATE_NEW = 17,
  VERIFIED = 18,
  AUTHEN_FAILED = 19,
  LOCK = 20,
}

export enum CustomerStatusNumberEnum {
  AUTHEN_FAILED = '23', // Xác thực thất bại
  PERMANENT_LOCK = '43', //Khóa vĩnh viễn
  VERIFIED = '22', //Đã xác thực
  CREATE_NEW = '20', //Tạo mới
  TEMPORARY_LOCK = '41', //Khóa tạm thời
}

export enum MerchantVersion {
  ONE = 1,
  TWO = 2,
}

export enum MerchantStatus {
  RELEASED = 10, // Đã phát hành
  ACTIVATED = 11, // Đã kích hoạt
  ONLINE = 12, // Đang hoạt động
  INITIALIZED = 14, // Đã khởi tạo
  TEMPORARY_LOCK = 41, //Khóa tạm thời
  LOCK = 43, //Khóa vĩnh viễn
  ONE = '1',
  TWO = '2',
}

export enum OrderStatusEnum {
  SUCCESS = 3,
  FAILED = 4,
  OTHER = 2,
  OTHERS = 6,
}

export enum TypeCodeRemoveEnum {
  VA = 'VA',
  SETTLEMENT_NOW = 'SETTLEMENT_NOW',
  REFUND = 'REFUND',
  REFUND_FEE = 'REFUND_FEE',
  REFUND_FEE_VAT = 'REFUND_FEE_VAT',
  WAL2BANK = 'WAL2BANK',
}

export enum TypeCodeReceiverEnum {
  CASHIN = 'CASHIN',
  CASHINMC = 'CASHINMC',
  WAL2WAL = 'WAL2WAL',
}

export enum TypeCodeSenderEnum {
  TRANSFER = 'TRANSFER',
  CASHOUT = 'CASHOUT',
  CASHOUTMC = 'CASHOUTMC',
  FEE_SETTLEMENT = 'FEE_SETTLEMENT',
  PAYBYTOKEN = 'PAYBYTOKEN',
  PAY_WAL = 'PAY_WAL',
  SETTLEMENT = 'SETTLEMENT',
  SETTLEMENT_DAY = 'SETTLEMENT_DAY',
}

export enum TypeCodeCashOutEnum {
  CASHOUT = 'CASHOUT',
  CASHOUTMC = 'CASHOUTMC',
}

export enum TypeCodePayEnum {
  FEE_SETTLEMENT = 'FEE_SETTLEMENT',
  PAYBYTOKEN = 'PAYBYTOKEN',
  PAY_WAL = 'PAY_WAL',
  SETTLEMENT = 'SETTLEMENT',
  SETTLEMENT_DAY = 'SETTLEMENT_DAY',
  SETTLEMENT_NOW = 'SETTLEMENT_NOW',
}

export enum ServiceTypeEnum {
  PAY_COLLECT = 'PAY_COLLECT', //thu hộ chi hộ
  WALLET = 'WALLET', //ví ví
}

export enum SuccessTypeEnum {
  SALARY_PAYMENT = 'salaryPayment', // Nhận chi lương
  DEPOSIT = 'deposit', // Nạp tiền
  WALLET_TRANSFER = 'walletTransfer', // Chuyển khoản ví - ví
  CASHOUT = 'cashOut', // Rút tiền
  PAY = 'pay', // Thanh toán
  TOP_UP = 'topUp',
  BILLING = 'billing',
}

export enum SubTransTypeTopUpEnum {
  BUYCARD = 'BUYCARD',
  TOPUPCARD = 'TOPUPCARD',
  BUYDATA = 'BUYDATA',
}

export enum SubTransTypeBillingEnum {
  PAYBILLELECTRIC = 'PAYBILLELECTRIC',
  PAYBILLINTERNET = 'PAYBILLINTERNET',
  PAYBILLLOAN = 'PAYBILLLOAN',
  PAYBILLMOBILE = 'PAYBILLMOBILE',
  PAYBILLTELEPHONE = 'PAYBILLTELEPHONE',
  PAYBILLTV = 'PAYBILLTV',
  PAYBILLWATER = 'PAYBILLWATER',
}

export enum SystemErrorEnum {
  SYSTEM1 = 'Hệ thống nhà cung cấp hiện đang tạm ngừng hoạt động hoặc đang bảo trì',
  SYSTEM2 = 'Không tìm thấy phản hồi từ nhà phát hành',
  SYSTEM3 = 'Lỗi do hệ thông ngân hàng/ đơn vị chuyển mạch',
  SYSTEM4 = 'Số lượng thẻ không đủ theo yêu cầu',
}

export enum OTPErrorEnum {
  OTP1 = 'Giao dịch cần thực hiện OTP',
  OTP2 = 'Lỗi xác thực OTP',
  OTP3 = 'OTP hết hạn',
  OTP5 = 'PENDING_FOR_OTP',
}

export enum technicalErrorEnum {
  TECHNICAL1 = 'Không tìm thấy cấu hình routing tương ứng',
  TECHNICAL2 = 'Nhà cung cấp không tồn tại',
}

export enum NCCErrorEnum {
  NCC1 = 'Tài khoản Gtelpay không đủ số dư tại NCC',
}

export enum SystemMessErrorEnum {
  APP = 'Lỗi do APP',
  CONNECT = 'Lỗi do kết nối',
  TECHNICAL = 'Lỗi do Kỹ thuật',
  NCC = 'Lỗi do Vận hành',
  SYSTEM = 'Lỗi do Bank/NCC',
  OTP = 'Lỗi OTP',
  CLASSIFY = 'Phân loại lý do thất bại',
  USER = 'Lý do từ người dùng',
  SYSTEM_ALL = 'Lý do từ hệ thống',
}

export enum TypeStatusBankEnum {
  ERROR = 'ERROR',
  CANCEL = 'CANCEL',
  WAIT_OTP = 'WAIT_OTP',
  SUCCESS = 'SUCCESS',
}

export enum RowReportFailEnum {
  CLASSIFY = 66,
  USER = 67,
  SYSTEM_ALL = 68,
  APP = 69,
  CONNECT = 70,
  TECHNICAL = 71,
  NCC = 72,
  SYSTEM = 73,
  OTP = 75,
  OTHER = 86,
}
export enum ColumEnum {
  G = 'G',
  H = 'H',
  I = 'I',
  L = 'L',
  N = 'N',
  P = 'P',
  R = 'R',
  T = 'T',
  V = 'V',
  S = 'S',
  U = 'U',
  W = 'W',
  Z = 'Z',
  K = 'K',
  Q = 'Q',
  O = 'O',
  B = 'B',
  M = 'M',
}

export enum RowReportTolalEnum {
  COUNT = 27,
  COUNT_SUCCESS = 28,
  PERCENTAGE_SUCCESS = 29,
  COUNT_FAIL = 30,
  PERCENTAGE_FAIL = 31,
}

export enum RowBankEfficiencyEnum {
  COUNT = 210,
  USER_TOTAL = 211,
  AVERAGE = 212,
  COUNT_SUCCESS = 213,
  COUNT_FAIL = 214,
  COUNT_CANCEL_IN_PERIOD = 216,
  USER_CANCEL_IN_PERIOD = 219,
  COUNT_CANCEL_BEFORE_PERIOD = 217,
  USER_CANCEL_BEFORE_PERIOD = 220,
  CANCEL_TOTAL = 215,
  USER_CANCEL_TOTAL = 218,
  AVERAGE_CANCEL = 221,
}
