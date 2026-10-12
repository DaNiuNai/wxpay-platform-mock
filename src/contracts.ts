// 由 scripts/generate-contracts.ts 从本地官方文档生成，请勿手改。
import type { Contract } from './types.js'
export const contracts: Contract[] = [
  {
    method: 'GET',
    path: '/v3/apply4sub/sub_merchants/{sub_mchid}/application/{application_no}',
    documents: [
      '平台收付通-电商交易解决方案/03-商户进件/02-API列表/06-查询结算账户修改申请状态.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'account_number_rule',
          type: 'string',
          required: false,
        },
      ],
      path: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'application_no',
          type: 'string(64)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/apply4sub/sub_merchants/{sub_mchid}/modify-settlement',
    documents: [
      '平台收付通-电商交易解决方案/03-商户进件/02-API列表/04-修改结算账户.md',
    ],
    requiresSerial: true,
    fields: {
      body: [
        {
          name: 'account_type',
          type: 'string',
          required: true,
        },
        {
          name: 'account_bank',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'bank_name',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'bank_branch_id',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'account_number',
          type: 'string(1024)',
          required: true,
          sensitive: true,
        },
        {
          name: 'account_name',
          type: 'string',
          required: false,
          sensitive: true,
        },
      ],
      query: [],
      path: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/apply4sub/sub_merchants/{sub_mchid}/settlement',
    documents: [
      '平台收付通-电商交易解决方案/03-商户进件/02-API列表/05-查询结算账户.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'account_number_rule',
          type: 'string',
          required: false,
        },
      ],
      path: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/bill/fundflowbill',
    documents: [
      '平台收付通-电商交易解决方案/09-账单下载/02-API列表/02-申请资金账单.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'bill_date',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'account_type',
          type: 'string',
          required: false,
        },
        {
          name: 'tar_type',
          type: 'string',
          required: false,
        },
      ],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/bill/tradebill',
    documents: [
      '平台收付通-电商交易解决方案/09-账单下载/02-API列表/01-申请交易账单.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'bill_date',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'sub_mchid',
          type: 'string(12)',
          required: false,
        },
        {
          name: 'bill_type',
          type: 'string',
          required: false,
        },
        {
          name: 'tar_type',
          type: 'string',
          required: false,
        },
      ],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/billdownload/file',
    documents: [
      '平台收付通-电商交易解决方案/09-账单下载/02-API列表/04-下载账单.md',
      '平台收付通-电商交易解决方案/09-账单下载/02-API列表/06-下载单个子商户／二级商户资金账单.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'token',
          type: 'string',
          required: true,
        },
      ],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/combine-transactions/app',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/02-合单支付/02-API列表/02-APP合单支付/01-合单下单-APP.md',
    ],
    fields: {
      body: [
        {
          name: 'combine_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'sub_orders',
          type: 'array[ReqSubOrderCompatible]',
          required: true,
        },
        {
          name: 'sub_orders.mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.attach',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'sub_orders.amount',
          type: 'object',
          required: true,
        },
        {
          name: 'sub_orders.amount.total_amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'sub_orders.amount.currency',
          type: 'string(8)',
          required: true,
        },
        {
          name: 'sub_orders.out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'sub_orders.settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'sub_orders.sub_appid',
          type: 'string',
          required: false,
        },
        {
          name: 'sub_orders.goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'time_start',
          type: 'string',
          required: false,
        },
        {
          name: 'time_expire',
          type: 'string',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(255)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/combine-transactions/h5',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/02-合单支付/02-API列表/03-H5合单支付/01-合单下单-H5.md',
    ],
    fields: {
      body: [
        {
          name: 'combine_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info.h5_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.h5_info.type',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info.h5_info.app_name',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'scene_info.h5_info.app_url',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'scene_info.h5_info.bundle_id',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'scene_info.h5_info.package_name',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'sub_orders',
          type: 'array[ReqSubOrder]',
          required: true,
        },
        {
          name: 'sub_orders.mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.attach',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'sub_orders.amount',
          type: 'object',
          required: true,
        },
        {
          name: 'sub_orders.amount.total_amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'sub_orders.amount.currency',
          type: 'string(8)',
          required: true,
        },
        {
          name: 'sub_orders.out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'sub_orders.settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'sub_orders.sub_appid',
          type: 'string',
          required: false,
        },
        {
          name: 'sub_orders.goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'time_start',
          type: 'string',
          required: false,
        },
        {
          name: 'time_expire',
          type: 'string',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(255)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/combine-transactions/jsapi',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/02-合单支付/02-API列表/01-JSAPI合单支付/01-合单下单-JSAPI.md',
      '平台收付通-电商交易解决方案/05-支付下单/02-合单支付/02-API列表/05-小程序合单支付/01-合单下单-小程序.md',
    ],
    fields: {
      body: [
        {
          name: 'combine_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'sub_orders',
          type: 'array[UnionSubOrder]',
          required: true,
        },
        {
          name: 'sub_orders.mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.attach',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'sub_orders.amount',
          type: 'object',
          required: true,
        },
        {
          name: 'sub_orders.amount.total_amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'sub_orders.amount.currency',
          type: 'string(8)',
          required: true,
        },
        {
          name: 'sub_orders.out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'sub_orders.settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'sub_orders.sub_appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'sub_orders.goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'combine_payer_info',
          type: 'object',
          required: true,
        },
        {
          name: 'combine_payer_info.openid',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'combine_payer_info.sub_openid',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'time_start',
          type: 'string',
          required: false,
        },
        {
          name: 'time_expire',
          type: 'string',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(255)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/combine-transactions/native',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/02-合单支付/02-API列表/04-Native合单支付/01-合单下单-NATIVE.md',
    ],
    fields: {
      body: [
        {
          name: 'combine_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'combine_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'sub_orders',
          type: 'array[ReqSubOrder]',
          required: true,
        },
        {
          name: 'sub_orders.mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.attach',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'sub_orders.amount',
          type: 'object',
          required: true,
        },
        {
          name: 'sub_orders.amount.total_amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'sub_orders.amount.currency',
          type: 'string(8)',
          required: true,
        },
        {
          name: 'sub_orders.out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'sub_orders.settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'sub_orders.settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'sub_orders.sub_appid',
          type: 'string',
          required: false,
        },
        {
          name: 'sub_orders.goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'time_expire',
          type: 'string',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/combine-transactions/out-trade-no/{combine_out_trade_no}',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/02-合单支付/02-API列表/06-公共API/01-合单查询订单.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'combine_out_trade_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/combine-transactions/out-trade-no/{combine_out_trade_no}/close',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/02-合单支付/02-API列表/06-公共API/02-合单关闭订单.md',
    ],
    fields: {
      body: [
        {
          name: 'combine_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders',
          type: 'array[ReqCloseSubOrder]',
          required: true,
        },
        {
          name: 'sub_orders.mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_orders.sub_appid',
          type: 'string(32)',
          required: false,
        },
      ],
      query: [],
      path: [
        {
          name: 'combine_out_trade_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/account/apply-cancel-withdraw',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/03-注销提现（新流程）/01-API列表/01-提交注销提现申请.md',
    ],
    requiresSerial: true,
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'withdraw',
          type: 'string',
          required: false,
        },
        {
          name: 'payee_info',
          type: 'object',
          required: false,
        },
        {
          name: 'payee_info.account_type',
          type: 'string',
          required: true,
        },
        {
          name: 'payee_info.bank_account_info',
          type: 'object',
          required: true,
        },
        {
          name: 'payee_info.bank_account_info.account_name',
          type: 'string(2048)',
          required: true,
          sensitive: true,
        },
        {
          name: 'payee_info.bank_account_info.account_bank',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'payee_info.bank_account_info.bank_branch_id',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'payee_info.bank_account_info.bank_branch_name',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'payee_info.bank_account_info.account_number',
          type: 'string(2048)',
          required: true,
          sensitive: true,
        },
        {
          name: 'payee_info.identity_info',
          type: 'object',
          required: false,
        },
        {
          name: 'payee_info.identity_info.id_doc_type',
          type: 'string',
          required: false,
        },
        {
          name: 'payee_info.identity_info.identification_name',
          type: 'string(2048)',
          required: false,
          sensitive: true,
        },
        {
          name: 'payee_info.identity_info.identification_no',
          type: 'string(2048)',
          required: false,
          sensitive: true,
        },
        {
          name: 'proof_medias',
          type: 'array[ProofMedia]',
          required: false,
        },
        {
          name: 'proof_medias.proof_media_type',
          type: 'string',
          required: true,
        },
        {
          name: 'proof_medias.proof_media',
          type: 'string(1024)',
          required: true,
        },
        {
          name: 'additional_materials',
          type: 'array[string]',
          required: false,
        },
        {
          name: 'remark',
          type: 'string(32)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/account/apply-cancel-withdraw/applyment-id/{applyment_id}',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/03-注销提现（新流程）/01-API列表/03-微信支付申请单号查询申请单状态.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'applyment_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/account/apply-cancel-withdraw/out-request-no/{out_request_no}',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/03-注销提现（新流程）/01-API列表/02-商户申请单号查询申请单状态.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/account/apply-cancel-withdraw/validate-cancel/{sub_mchid}',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/02-注销预校验/01-API列表/01-商户注销资格校验.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/account/cancel-applications',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/04-注销申请与提现（旧流程）/01-注销申请/01-API列表/01-注销申请单/01-提交注销申请单.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_apply_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'application_info',
          type: 'array[CancelApplicationInfo]',
          required: true,
        },
        {
          name: 'application_info.application_type',
          type: 'string',
          required: true,
        },
        {
          name: 'application_info.application_media_id',
          type: 'string(512)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/account/cancel-applications/media',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/04-注销申请与提现（旧流程）/01-注销申请/01-API列表/02-图片上传/01-图片上传.md',
    ],
    fields: {
      body: [
        {
          name: 'file',
          type: 'message',
          required: true,
        },
        {
          name: 'meta',
          type: 'object',
          required: true,
        },
        {
          name: 'meta.file_name',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'meta.file_digest',
          type: 'string(64)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/account/cancel-applications/out-apply-no/{out_apply_no}',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/04-注销申请与提现（旧流程）/01-注销申请/01-API列表/01-注销申请单/02-查询注销单状态.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'out_apply_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/applyments',
    documents: [
      '平台收付通-电商交易解决方案/03-商户进件/02-API列表/01-提交申请单.md',
    ],
    requiresSerial: true,
    fields: {
      body: [
        {
          name: 'out_request_no',
          type: 'string(124)',
          required: true,
        },
        {
          name: 'organization_type',
          type: 'string(4)',
          required: true,
        },
        {
          name: 'finance_institution',
          type: 'boolean',
          required: false,
        },
        {
          name: 'business_license_info',
          type: 'object',
          required: false,
        },
        {
          name: 'business_license_info.cert_type',
          type: 'string',
          required: false,
        },
        {
          name: 'business_license_info.business_license_copy',
          type: 'string',
          required: true,
        },
        {
          name: 'business_license_info.business_license_number',
          type: 'string',
          required: true,
        },
        {
          name: 'business_license_info.merchant_name',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'business_license_info.legal_person',
          type: 'string(100)',
          required: true,
        },
        {
          name: 'business_license_info.company_address',
          type: 'string',
          required: false,
        },
        {
          name: 'business_license_info.business_time',
          type: 'string',
          required: false,
        },
        {
          name: 'finance_institution_info',
          type: 'object',
          required: false,
        },
        {
          name: 'finance_institution_info.finance_type',
          type: 'string',
          required: true,
        },
        {
          name: 'finance_institution_info.finance_license_pics',
          type: 'array',
          required: true,
        },
        {
          name: 'id_holder_type',
          type: 'string',
          required: false,
        },
        {
          name: 'id_doc_type',
          type: 'string',
          required: false,
        },
        {
          name: 'authorize_letter_copy',
          type: 'string',
          required: false,
        },
        {
          name: 'id_card_info',
          type: 'object',
          required: false,
        },
        {
          name: 'id_card_info.id_card_copy',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'id_card_info.id_card_national',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'id_card_info.id_card_name',
          type: 'string(100)',
          required: true,
          sensitive: true,
        },
        {
          name: 'id_card_info.id_card_number',
          type: 'string',
          required: true,
          sensitive: true,
        },
        {
          name: 'id_card_info.id_card_valid_time_begin',
          type: 'string',
          required: true,
        },
        {
          name: 'id_card_info.id_card_valid_time',
          type: 'string',
          required: true,
        },
        {
          name: 'id_doc_info',
          type: 'object',
          required: false,
        },
        {
          name: 'id_doc_info.id_doc_name',
          type: 'string',
          required: true,
          sensitive: true,
        },
        {
          name: 'id_doc_info.id_doc_number',
          type: 'string',
          required: true,
          sensitive: true,
        },
        {
          name: 'id_doc_info.id_doc_copy',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'id_doc_info.id_doc_copy_back',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'id_doc_info.doc_period_begin',
          type: 'string',
          required: true,
        },
        {
          name: 'id_doc_info.doc_period_end',
          type: 'string',
          required: true,
        },
        {
          name: 'owner',
          type: 'boolean',
          required: false,
        },
        {
          name: 'ubo_info_list',
          type: 'array',
          required: false,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_type',
          type: 'string',
          required: false,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_copy',
          type: 'string',
          required: false,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_copy_back',
          type: 'string',
          required: false,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_name',
          type: 'string(100)',
          required: false,
          sensitive: true,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_number',
          type: 'string',
          required: false,
          sensitive: true,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_address',
          type: 'string',
          required: false,
          sensitive: true,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_period_begin',
          type: 'string',
          required: false,
        },
        {
          name: 'ubo_info_list.ubo_id_doc_period_end',
          type: 'string',
          required: false,
        },
        {
          name: 'account_info',
          type: 'object',
          required: true,
        },
        {
          name: 'account_info.bank_account_type',
          type: 'string(2)',
          required: true,
        },
        {
          name: 'account_info.account_bank',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'account_info.account_name',
          type: 'string(128)',
          required: true,
          sensitive: true,
        },
        {
          name: 'account_info.bank_address_code',
          type: 'string(12)',
          required: false,
        },
        {
          name: 'account_info.bank_branch_id',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'account_info.bank_name',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'account_info.account_number',
          type: 'string(128)',
          required: true,
          sensitive: true,
        },
        {
          name: 'contact_info',
          type: 'object',
          required: true,
        },
        {
          name: 'contact_info.contact_type',
          type: 'string(2)',
          required: true,
        },
        {
          name: 'contact_info.contact_name',
          type: 'string(10)',
          required: true,
          sensitive: true,
        },
        {
          name: 'contact_info.contact_id_doc_type',
          type: 'string',
          required: false,
        },
        {
          name: 'contact_info.contact_id_card_number',
          type: 'string',
          required: false,
          sensitive: true,
        },
        {
          name: 'contact_info.contact_id_doc_copy',
          type: 'string',
          required: false,
        },
        {
          name: 'contact_info.contact_id_doc_copy_back',
          type: 'string',
          required: false,
        },
        {
          name: 'contact_info.contact_id_doc_period_begin',
          type: 'string',
          required: false,
        },
        {
          name: 'contact_info.contact_id_doc_period_end',
          type: 'string',
          required: false,
        },
        {
          name: 'contact_info.business_authorization_letter',
          type: 'string',
          required: false,
        },
        {
          name: 'contact_info.mobile_phone',
          type: 'string',
          required: true,
          sensitive: true,
        },
        {
          name: 'sales_scene_info',
          type: 'object',
          required: true,
        },
        {
          name: 'sales_scene_info.store_name',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'sales_scene_info.store_url',
          type: 'string(1024)',
          required: false,
        },
        {
          name: 'sales_scene_info.store_qr_code',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'sales_scene_info.mini_program_sub_appid',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'settlement_info',
          type: 'object',
          required: false,
        },
        {
          name: 'settlement_info.settlement_id',
          type: 'integer',
          required: false,
        },
        {
          name: 'settlement_info.qualification_type',
          type: 'string(200)',
          required: false,
        },
        {
          name: 'merchant_shortname',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'qualifications',
          type: 'string(1024)',
          required: false,
        },
        {
          name: 'business_addition_pics',
          type: 'string(1024)',
          required: false,
        },
        {
          name: 'business_addition_desc',
          type: 'string(512)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/applyments/{applyment_id}',
    documents: [
      '平台收付通-电商交易解决方案/03-商户进件/02-API列表/03-通过申请单ID查询申请状态.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'applyment_id',
          type: 'integer',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/applyments/out-request-no/{out_request_no}',
    documents: [
      '平台收付通-电商交易解决方案/03-商户进件/02-API列表/02-通过业务申请编号查询申请状态.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'out_request_no',
          type: 'string(124)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/bill/fundflowbill',
    documents: [
      '平台收付通-电商交易解决方案/09-账单下载/02-API列表/05-申请二级商户资金账单.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'bill_date',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'account_type',
          type: 'string',
          required: true,
        },
        {
          name: 'tar_type',
          type: 'string',
          required: false,
        },
        {
          name: 'algorithm',
          type: 'string',
          required: true,
          sensitive: true,
        },
      ],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/fund/balance/{sub_mchid}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/01-余额查询/01-API列表/01-查询二级商户账户实时余额.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'account_type',
          type: 'string',
          required: false,
        },
      ],
      path: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/fund/enddaybalance/{sub_mchid}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/01-余额查询/01-API列表/02-查询二级商户账户日终余额.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'date',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'account_type',
          type: 'string',
          required: false,
        },
      ],
      path: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/fund/withdraw',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/01-二级商户预约提现.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'remark',
          type: 'string(56)',
          required: false,
        },
        {
          name: 'bank_memo',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'account_type',
          type: 'string',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(256)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/fund/withdraw/{withdraw_id}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/03-二级商户查询预约提现状态（根据微信支付预约提现单号查询）.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string',
          required: true,
        },
      ],
      path: [
        {
          name: 'withdraw_id',
          type: 'string(128)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/fund/withdraw/out-request-no/{out_request_no}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/02-二级商户查询预约提现状态（根据商户预约提现单号查询）.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string',
          required: true,
        },
      ],
      path: [
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/profitsharing/finish-order',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/05-解冻剩余资金.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_order_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'description',
          type: 'string(80)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/profitsharing/orders',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/02-查询分账结果.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_order_no',
          type: 'string(64)',
          required: true,
        },
      ],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/profitsharing/orders',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/01-请求分账.md',
    ],
    requiresSerial: true,
    fields: {
      body: [
        {
          name: 'appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_order_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'receivers',
          type: 'array[object]',
          required: true,
        },
        {
          name: 'receivers.type',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'receivers.receiver_account',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'receivers.amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'receivers.description',
          type: 'string(80)',
          required: true,
        },
        {
          name: 'receivers.receiver_name',
          type: 'string(10240)',
          required: false,
          sensitive: true,
        },
        {
          name: 'finish',
          type: 'boolean',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/profitsharing/orders/{transaction_id}/amounts',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/06-查询订单剩余待分金额.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/profitsharing/receivers/add',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/07-添加分账接收方.md',
    ],
    fields: {
      body: [
        {
          name: 'appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'type',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'account',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'relation_type',
          type: 'string(32)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/profitsharing/receivers/delete',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/08-删除分账接收方.md',
    ],
    fields: {
      body: [
        {
          name: 'appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'type',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'account',
          type: 'string(64)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/profitsharing/returnorders',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/04-查询分账回退结果.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_return_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'order_id',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'out_order_no',
          type: 'string(64)',
          required: false,
        },
      ],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/profitsharing/returnorders',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/01-分账/03-API列表/03-请求分账回退.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'order_id',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'out_order_no',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'out_return_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'return_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'description',
          type: 'string(80)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/refunds/{refund_id}/apply-abnormal-refund',
    documents: [
      '平台收付通-电商交易解决方案/07-交易退款/02-API列表/07-发起异常退款.md',
    ],
    requiresSerial: true,
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_refund_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          required: true,
        },
        {
          name: 'bank_type',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'bank_account',
          type: 'string(1024)',
          required: false,
          sensitive: true,
        },
        {
          name: 'real_name',
          type: 'string(1024)',
          required: false,
          sensitive: true,
        },
      ],
      query: [],
      path: [
        {
          name: 'refund_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/refunds/{refund_id}/return-advance',
    documents: [
      '平台收付通-电商交易解决方案/07-交易退款/02-API列表/05-查询垫付回补结果.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      path: [
        {
          name: 'refund_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/refunds/{refund_id}/return-advance',
    documents: [
      '平台收付通-电商交易解决方案/07-交易退款/02-API列表/06-垫付退款回补.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      query: [],
      path: [
        {
          name: 'refund_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/refunds/apply',
    documents: [
      '平台收付通-电商交易解决方案/07-交易退款/02-API列表/01-申请退款.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'sp_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'out_trade_no',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'out_refund_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'reason',
          type: 'string(80)',
          required: false,
        },
        {
          name: 'amount',
          type: 'object',
          required: true,
        },
        {
          name: 'amount.refund',
          type: 'integer',
          required: true,
        },
        {
          name: 'amount.from',
          type: 'array[object]',
          required: false,
        },
        {
          name: 'amount.from.account',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'amount.from.amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'amount.total',
          type: 'integer',
          required: true,
        },
        {
          name: 'amount.currency',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'refund_account',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'funds_account',
          type: 'string(32)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/refunds/id/{refund_id}',
    documents: [
      '平台收付通-电商交易解决方案/07-交易退款/02-API列表/02-查询单笔退款（按微信支付退款单号）.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      path: [
        {
          name: 'refund_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/refunds/out-refund-no/{out_refund_no}',
    documents: [
      '平台收付通-电商交易解决方案/07-交易退款/02-API列表/03-查询单笔退款（按商户退款单号）.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      path: [
        {
          name: 'out_refund_no',
          type: 'string(64)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/ecommerce/subject-sub-merchants',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/05-商户查询/01-API列表/01-查询指定主体子商户列表.md',
    ],
    requiresSerial: true,
    fields: {
      body: [],
      query: [
        {
          name: 'organization_type',
          type: 'string',
          required: true,
        },
        {
          name: 'cert_number',
          type: 'string(512)',
          required: true,
          sensitive: true,
        },
        {
          name: 'limit',
          type: 'integer',
          required: false,
        },
        {
          name: 'offset',
          type: 'integer',
          required: false,
        },
      ],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/subsidies/cancel',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/02-补差/02-API列表/03-取消补差.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'description',
          type: 'string(80)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/subsidies/create',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/02-补差/02-API列表/01-请求补差.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'description',
          type: 'string(80)',
          required: true,
        },
        {
          name: 'out_subsidy_no',
          type: 'string',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/ecommerce/subsidies/return',
    documents: [
      '平台收付通-电商交易解决方案/06-补差与分账/02-补差/02-API列表/02-请求补差回退.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_order_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'refund_id',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'description',
          type: 'string(80)',
          required: true,
        },
        {
          name: 'subsidy_id',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'from',
          type: 'array[ReturnFrom]',
          required: false,
        },
        {
          name: 'from.account',
          type: 'string',
          required: false,
        },
        {
          name: 'from.amount',
          type: 'integer',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/funds-to-oversea/bill-download-url',
    documents: [
      '平台收付通-电商交易解决方案/10-跨境付款/02-API列表/04-获取购付汇账单文件下载链接.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'bill_date',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'sub_mchid',
          type: 'string(20)',
          required: false,
        },
      ],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/funds-to-oversea/orders',
    documents: [
      '平台收付通-电商交易解决方案/10-跨境付款/02-API列表/02-申请资金出境.md',
    ],
    fields: {
      body: [
        {
          name: 'out_order_id',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'sub_mchid',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'foreign_currency',
          type: 'string(20)',
          required: true,
        },
        {
          name: 'goods_info',
          type: 'array[GoodsInfo]',
          required: false,
        },
        {
          name: 'goods_info.goods_name',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'goods_info.goods_category',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'goods_info.goods_unit_price',
          type: 'integer',
          required: true,
        },
        {
          name: 'goods_info.goods_quantity',
          type: 'integer',
          required: true,
        },
        {
          name: 'seller_info',
          type: 'object',
          required: true,
        },
        {
          name: 'seller_info.oversea_business_name',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'seller_info.oversea_shop_name',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'seller_info.seller_id',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'express_info',
          type: 'object',
          required: false,
        },
        {
          name: 'express_info.courier_number',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'express_info.express_company_name',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'payee_info',
          type: 'object',
          required: true,
        },
        {
          name: 'payee_info.payee_id',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'presale_info',
          type: 'object',
          required: false,
        },
        {
          name: 'presale_info.type',
          type: 'string',
          required: true,
        },
        {
          name: 'presale_info.total_amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'presale_info.deposit_transaction_id',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'presale_info.balance_transaction_id',
          type: 'string(64)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/funds-to-oversea/orders/{out_order_id}',
    documents: [
      '平台收付通-电商交易解决方案/10-跨境付款/02-API列表/03-查询出境结果.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'transaction_id',
          type: 'string(64)',
          required: true,
        },
      ],
      path: [
        {
          name: 'out_order_id',
          type: 'string(64)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/funds-to-oversea/transactions/{transaction_id}/available_abroad_amounts',
    documents: [
      '平台收付通-电商交易解决方案/10-跨境付款/02-API列表/01-查询订单剩余可出境余额.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      path: [
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/mch_operate/risk/withdrawl-apply',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/04-注销申请与提现（旧流程）/02-注销后提现/01-API列表/01-提交已注销商户号可用余额提现申请单.md',
    ],
    requiresSerial: true,
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_account_type',
          type: 'string',
          required: true,
        },
        {
          name: 'amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'payee_type',
          type: 'string',
          required: true,
        },
        {
          name: 'payee_mchid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'payee_info',
          type: 'object',
          required: true,
        },
        {
          name: 'payee_info.account_type',
          type: 'string',
          required: true,
        },
        {
          name: 'payee_info.bank_account_info',
          type: 'object',
          required: true,
        },
        {
          name: 'payee_info.bank_account_info.account_name',
          type: 'string(2048)',
          required: true,
          sensitive: true,
        },
        {
          name: 'payee_info.bank_account_info.account_bank',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'payee_info.bank_account_info.bank_branch_id',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'payee_info.bank_account_info.bank_name',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'payee_info.bank_account_info.account_number',
          type: 'string(2048)',
          required: true,
          sensitive: true,
        },
        {
          name: 'payee_info.identity_info',
          type: 'object',
          required: false,
        },
        {
          name: 'payee_info.identity_info.id_doc_type',
          type: 'string',
          required: false,
        },
        {
          name: 'payee_info.identity_info.identification_name',
          type: 'string(2048)',
          required: false,
          sensitive: true,
        },
        {
          name: 'payee_info.identity_info.identification_no',
          type: 'string(2048)',
          required: false,
          sensitive: true,
        },
        {
          name: 'proof_media_list',
          type: 'object',
          required: false,
        },
        {
          name: 'proof_media_list.proof_payee_media',
          type: 'array[object]',
          required: false,
        },
        {
          name: 'proof_media_list.proof_payee_media.proof_media_type',
          type: 'string',
          required: true,
        },
        {
          name: 'proof_media_list.proof_payee_media.proof_media',
          type: 'string(1024)',
          required: true,
        },
        {
          name: 'additional_materials',
          type: 'object',
          required: false,
        },
        {
          name: 'additional_materials.additional_media',
          type: 'array[string]',
          required: false,
        },
        {
          name: 'remark',
          type: 'string(1024)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/mch_operate/risk/withdrawl-apply/applyment-id/{applyment_id}',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/04-注销申请与提现（旧流程）/02-注销后提现/01-API列表/03-微信支付提现申请单号查询提现申请单状态.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'applyment_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/mch_operate/risk/withdrawl-apply/out-request-no/{out_request_no}',
    documents: [
      '平台收付通-电商交易解决方案/04-商户注销/04-注销申请与提现（旧流程）/02-注销后提现/01-API列表/02-商户提现申请单号查询提现申请单状态.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/mchalterapply/mchsubjectalterapplyment',
    documents: [
      '平台收付通-电商交易解决方案/11-修改主体信息/01-API列表/01-提交申请单.md',
    ],
    requiresSerial: true,
    fields: {
      body: [
        {
          name: 'merchant_code',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_request_no',
          type: 'string(64)',
          required: true,
        },
        {
          name: 'alter_scope',
          type: 'string',
          required: false,
        },
        {
          name: 'organization_type',
          type: 'string',
          required: false,
        },
        {
          name: 'finance_institution',
          type: 'boolean',
          required: false,
        },
        {
          name: 'business_license_info',
          type: 'object',
          required: false,
        },
        {
          name: 'business_license_info.license_number',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'business_license_info.license_copy',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'business_license_info.merchant_name',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'business_license_info.legal_person',
          type: 'string(100)',
          required: true,
        },
        {
          name: 'business_license_info.company_address',
          type: 'string(512)',
          required: false,
        },
        {
          name: 'business_license_info.license_period_begin',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'business_license_info.license_period_end',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'certificate_info',
          type: 'object',
          required: false,
        },
        {
          name: 'certificate_info.cert_type',
          type: 'string',
          required: true,
        },
        {
          name: 'certificate_info.cert_number',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'certificate_info.cert_copy',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'certificate_info.merchant_name',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'certificate_info.legal_person',
          type: 'string(100)',
          required: true,
        },
        {
          name: 'certificate_info.company_address',
          type: 'string(512)',
          required: true,
        },
        {
          name: 'certificate_info.cert_period_begin',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'certificate_info.cert_period_end',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'finance_institution_info',
          type: 'object',
          required: false,
        },
        {
          name: 'finance_institution_info.finance_type',
          type: 'string',
          required: true,
        },
        {
          name: 'finance_institution_info.finance_license_pics',
          type: 'array[string]',
          required: true,
        },
        {
          name: 'legal_person_info',
          type: 'object',
          required: false,
        },
        {
          name: 'legal_person_info.id_holder_type',
          type: 'string',
          required: true,
        },
        {
          name: 'legal_person_info.id_doc_type',
          type: 'string',
          required: false,
        },
        {
          name: 'legal_person_info.authorize_letter_copy',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'legal_person_info.card_front',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'legal_person_info.card_back',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'legal_person_info.card_name',
          type: 'string(100)',
          required: false,
          sensitive: true,
        },
        {
          name: 'legal_person_info.card_number',
          type: 'string(512)',
          required: false,
          sensitive: true,
        },
        {
          name: 'legal_person_info.card_address',
          type: 'string(512)',
          required: false,
          sensitive: true,
        },
        {
          name: 'legal_person_info.card_period_begin',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'legal_person_info.card_period_end',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'legal_person_info.as_ubo',
          type: 'boolean',
          required: false,
        },
        {
          name: 'ubo_info_list',
          type: 'array[UboInfo]',
          required: false,
        },
        {
          name: 'ubo_info_list.id_doc_type',
          type: 'string',
          required: true,
        },
        {
          name: 'ubo_info_list.card_front',
          type: 'string(256)',
          required: true,
        },
        {
          name: 'ubo_info_list.card_back',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'ubo_info_list.card_name',
          type: 'string(100)',
          required: true,
          sensitive: true,
        },
        {
          name: 'ubo_info_list.card_number',
          type: 'string(512)',
          required: true,
          sensitive: true,
        },
        {
          name: 'ubo_info_list.card_address',
          type: 'string(512)',
          required: true,
          sensitive: true,
        },
        {
          name: 'ubo_info_list.card_period_begin',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'ubo_info_list.card_period_end',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'addition',
          type: 'object',
          required: false,
        },
        {
          name: 'addition.bank_openaccount_license',
          type: 'array[string]',
          required: false,
        },
        {
          name: 'addition.openaccount_approval',
          type: 'array[string]',
          required: false,
        },
        {
          name: 'addition.legal_other_prove',
          type: 'array[string]',
          required: false,
        },
        {
          name: 'addition.agency_prove',
          type: 'array[string]',
          required: false,
        },
        {
          name: 'addition.ubo_prove',
          type: 'array[string]',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/mchalterapply/mchsubjectalterapplyment/{apply_id}',
    documents: [
      '平台收付通-电商交易解决方案/11-修改主体信息/01-API列表/04-查询申请单状态-使用申请单号.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'apply_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/mchalterapply/mchsubjectalterapplyment/{apply_id}/revoke',
    documents: [
      '平台收付通-电商交易解决方案/11-修改主体信息/01-API列表/02-撤销申请单.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'apply_id',
          type: 'string(64)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/mchalterapply/mchsubjectalterapplyment/merchant/{merchant_code}/out-request-no/{out_request_no}',
    documents: [
      '平台收付通-电商交易解决方案/11-修改主体信息/01-API列表/03-查询申请单状态-使用业务单号.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'merchant_code',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_request_no',
          type: 'string(64)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/merchant/fund/balance/{account_type}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/01-余额查询/01-API列表/03-查询平台账户实时余额.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'account_type',
          type: 'string',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/merchant/fund/dayendbalance/{account_type}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/01-余额查询/01-API列表/04-查询平台账户日终余额.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'date',
          type: 'string(10)',
          required: false,
        },
      ],
      path: [
        {
          name: 'account_type',
          type: 'string',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/merchant/fund/withdraw',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/04-平台预约提现.md',
    ],
    fields: {
      body: [
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'amount',
          type: 'integer',
          required: true,
        },
        {
          name: 'remark',
          type: 'string(56)',
          required: false,
        },
        {
          name: 'bank_memo',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'account_type',
          type: 'string',
          required: true,
        },
        {
          name: 'notify_url',
          type: 'string(256)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/merchant/fund/withdraw/bill-type/{bill_type}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/09-按日下载提现异常文件.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'bill_date',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'tar_type',
          type: 'string',
          required: false,
        },
      ],
      path: [
        {
          name: 'bill_type',
          type: 'string',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/merchant/fund/withdraw/out-request-no/{out_request_no}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/05-平台查询预约提现状态（根据商户预约提现单号查询）.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'out_request_no',
          type: 'string',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/merchant/fund/withdraw/withdraw-id/{withdraw_id}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/06-平台查询预约提现状态（根据微信支付预约提现单号查询）.md',
    ],
    fields: {
      body: [],
      query: [],
      path: [
        {
          name: 'withdraw_id',
          type: 'string(128)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/merchant/media/upload',
    documents: [
      '平台收付通-电商交易解决方案/03-商户进件/02-API列表/07-文件上传.md',
    ],
    fields: {
      body: [
        {
          name: 'file',
          type: 'message',
          required: true,
        },
        {
          name: 'meta',
          type: 'Object',
          required: true,
        },
        {
          name: 'meta.filename',
          type: 'string(128)',
          required: true,
        },
        {
          name: 'meta.sha256',
          type: 'string(64)',
          required: true,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/pay/partner/transactions/app',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/01-APP支付/01-APP下单.md',
    ],
    fields: {
      body: [
        {
          name: 'sp_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sp_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'time_expire',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'attach',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(255)',
          required: true,
        },
        {
          name: 'goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'support_fapiao',
          type: 'boolean',
          required: false,
        },
        {
          name: 'amount',
          type: 'object',
          required: true,
        },
        {
          name: 'amount.total',
          type: 'integer',
          required: true,
        },
        {
          name: 'amount.currency',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'detail',
          type: 'object',
          required: false,
        },
        {
          name: 'detail.cost_price',
          type: 'integer',
          required: false,
        },
        {
          name: 'detail.invoice_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail',
          type: 'array',
          required: false,
        },
        {
          name: 'detail.goods_detail.merchant_goods_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'detail.goods_detail.wechatpay_goods_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail.goods_name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'detail.goods_detail.quantity',
          type: 'integer',
          required: true,
        },
        {
          name: 'detail.goods_detail.unit_price',
          type: 'integer',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.store_info.id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info.store_info.name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'scene_info.store_info.area_code',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info.address',
          type: 'string(512)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/pay/partner/transactions/h5',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/05-H5支付/01-H5下单.md',
    ],
    fields: {
      body: [
        {
          name: 'sp_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sp_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'time_expire',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'attach',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(255)',
          required: true,
        },
        {
          name: 'goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'support_fapiao',
          type: 'boolean',
          required: false,
        },
        {
          name: 'amount',
          type: 'object',
          required: true,
        },
        {
          name: 'amount.total',
          type: 'integer',
          required: true,
        },
        {
          name: 'amount.currency',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'detail',
          type: 'object',
          required: false,
        },
        {
          name: 'detail.cost_price',
          type: 'integer',
          required: false,
        },
        {
          name: 'detail.invoice_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail',
          type: 'array[object]',
          required: false,
        },
        {
          name: 'detail.goods_detail.merchant_goods_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'detail.goods_detail.wechatpay_goods_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail.goods_name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'detail.goods_detail.quantity',
          type: 'integer',
          required: true,
        },
        {
          name: 'detail.goods_detail.unit_price',
          type: 'integer',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: true,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.store_info.id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info.store_info.name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'scene_info.store_info.area_code',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info.address',
          type: 'string(512)',
          required: false,
        },
        {
          name: 'scene_info.h5_info',
          type: 'H5Info',
          required: true,
        },
        {
          name: 'scene_info.h5_info.type',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info.h5_info.app_name',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'scene_info.h5_info.app_url',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'scene_info.h5_info.bundle_id',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'scene_info.h5_info.package_name',
          type: 'string(128)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/pay/partner/transactions/id/{transaction_id}',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/06-公共API/01-微信支付订单号查询订单.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sp_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      path: [
        {
          name: 'transaction_id',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/pay/partner/transactions/jsapi',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/02-JSAPI支付/01-JSAPI下单.md',
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/04-小程序支付/01-小程序下单.md',
    ],
    fields: {
      body: [
        {
          name: 'sp_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sp_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'time_expire',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'attach',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(255)',
          required: true,
        },
        {
          name: 'goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'support_fapiao',
          type: 'boolean',
          required: false,
        },
        {
          name: 'amount',
          type: 'object',
          required: true,
        },
        {
          name: 'amount.total',
          type: 'integer',
          required: true,
        },
        {
          name: 'amount.currency',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'payer',
          type: 'PartnerJsapiReqPayerInfo',
          required: true,
        },
        {
          name: 'payer.sp_openid',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'payer.sub_openid',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'detail',
          type: 'object',
          required: false,
        },
        {
          name: 'detail.cost_price',
          type: 'integer',
          required: false,
        },
        {
          name: 'detail.invoice_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail',
          type: 'array',
          required: false,
        },
        {
          name: 'detail.goods_detail.merchant_goods_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'detail.goods_detail.wechatpay_goods_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail.goods_name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'detail.goods_detail.quantity',
          type: 'integer',
          required: true,
        },
        {
          name: 'detail.goods_detail.unit_price',
          type: 'integer',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.store_info.id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info.store_info.name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'scene_info.store_info.area_code',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info.address',
          type: 'string(512)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'POST',
    path: '/v3/pay/partner/transactions/native',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/03-Native支付/01-Native下单.md',
    ],
    fields: {
      body: [
        {
          name: 'sp_appid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sp_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_appid',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'description',
          type: 'string(127)',
          required: true,
        },
        {
          name: 'out_trade_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'time_expire',
          type: 'string(64)',
          required: false,
        },
        {
          name: 'attach',
          type: 'string(128)',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(255)',
          required: true,
        },
        {
          name: 'goods_tag',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'settle_info',
          type: 'object',
          required: false,
        },
        {
          name: 'settle_info.profit_sharing',
          type: 'boolean',
          required: false,
        },
        {
          name: 'settle_info.subsidy_amount',
          type: 'integer',
          required: false,
        },
        {
          name: 'support_fapiao',
          type: 'boolean',
          required: false,
        },
        {
          name: 'amount',
          type: 'object',
          required: true,
        },
        {
          name: 'amount.total',
          type: 'integer',
          required: true,
        },
        {
          name: 'amount.currency',
          type: 'string(16)',
          required: false,
        },
        {
          name: 'detail',
          type: 'object',
          required: false,
        },
        {
          name: 'detail.cost_price',
          type: 'integer',
          required: false,
        },
        {
          name: 'detail.invoice_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail',
          type: 'array[object]',
          required: false,
        },
        {
          name: 'detail.goods_detail.merchant_goods_id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'detail.goods_detail.wechatpay_goods_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'detail.goods_detail.goods_name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'detail.goods_detail.quantity',
          type: 'integer',
          required: true,
        },
        {
          name: 'detail.goods_detail.unit_price',
          type: 'integer',
          required: true,
        },
        {
          name: 'scene_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.payer_client_ip',
          type: 'string(45)',
          required: true,
        },
        {
          name: 'scene_info.device_id',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info',
          type: 'object',
          required: false,
        },
        {
          name: 'scene_info.store_info.id',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'scene_info.store_info.name',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'scene_info.store_info.area_code',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'scene_info.store_info.address',
          type: 'string(512)',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/pay/partner/transactions/out-trade-no/{out_trade_no}',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/06-公共API/02-微信支付商户订单号查询订单.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sp_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      path: [
        {
          name: 'out_trade_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/pay/partner/transactions/out-trade-no/{out_trade_no}/close',
    documents: [
      '平台收付通-电商交易解决方案/05-支付下单/01-普通支付/02-API列表/06-公共API/03-关闭订单.md',
    ],
    fields: {
      body: [
        {
          name: 'sp_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
      ],
      query: [],
      path: [
        {
          name: 'out_trade_no',
          type: 'string(32)',
          required: true,
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/07-二级商户按日终余额预约提现.md',
    ],
    fields: {
      body: [
        {
          name: 'sub_mchid',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'out_request_no',
          type: 'string(32)',
          required: true,
        },
        {
          name: 'calculate_amount_type',
          type: 'string',
          required: true,
        },
        {
          name: 'remark',
          type: 'string(56)',
          required: false,
        },
        {
          name: 'bank_memo',
          type: 'string(32)',
          required: false,
        },
        {
          name: 'notify_url',
          type: 'string(256)',
          required: false,
        },
        {
          name: 'reserve_amount',
          type: 'integer',
          required: false,
        },
      ],
      query: [],
      path: [],
    },
  },
  {
    method: 'GET',
    path: '/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw/out-request-no/{out_request_no}',
    documents: [
      '平台收付通-电商交易解决方案/08-账户资金管理/02-商户提现/02-API列表/08-查询二级商户按日终余额预约提现状态.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string',
          required: true,
        },
      ],
      path: [
        {
          name: 'out_request_no',
          type: 'string',
          required: true,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/v3/profitsharing/bills',
    documents: [
      '平台收付通-电商交易解决方案/09-账单下载/02-API列表/03-申请分账账单.md',
    ],
    fields: {
      body: [],
      query: [
        {
          name: 'sub_mchid',
          type: 'string(12)',
          required: false,
        },
        {
          name: 'bill_date',
          type: 'string(10)',
          required: true,
        },
        {
          name: 'tar_type',
          type: 'string',
          required: false,
        },
      ],
      path: [],
    },
  },
]
