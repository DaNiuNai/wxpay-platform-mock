export type Data = Record<string, unknown>

export interface MockConfig {
  host: string
  port: number
  baseUrl: string
  spMchid: string
  spAppid: string
  subMchid: string
  strict: boolean
  autoPay: boolean
  autoComplete: boolean
  apiV3Key: string
  serviceNotifyUrl: string
  callbackTimeoutMs: number
  callbackRetryMs: number[]
}

export interface Order {
  sp_appid: string
  sp_mchid: string
  sub_appid?: string
  sub_mchid: string
  out_trade_no: string
  transaction_id: string
  prepay_id: string
  trade_type: string
  trade_state: string
  description: string
  amount: {
    total: number
    currency: string
    payer_total?: number
    payer_currency?: string
  }
  payer: Data
  attach?: string
  notify_url: string
  settle_info: Data
  create_time: string
  success_time?: string
  combine_out_trade_no?: string
  refunded: number
  remaining: number
  sharing_finished: boolean
}

export interface Account {
  mchid: string
  account_type: string
  available: number
  frozen: number
}

export interface RequestContext {
  body: Data
  query: Data
  params: Data
  request: Request
  rawBody?: string
}

export interface ContractField {
  name: string
  type: string
  required: boolean
  sensitive?: boolean
}

export interface Contract {
  method: string
  path: string
  documents: string[]
  requiresSerial?: boolean
  fields: {
    body: ContractField[]
    query: ContractField[]
    path: ContractField[]
  }
}
