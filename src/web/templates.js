let sequence = 0

/** 每次主动加载样例时生成新的业务单号；不修改调用方的配置或状态。 */
export function createTemplates(config, snapshot = {}) {
  const spMchid = config.spMchid
  const spAppid = config.spAppid
  const subMchid = config.subMchid
  const notifyUrl = `${config.baseUrl.replace(/\/$/, '')}/mock/receiver`
  const number = (prefix) =>
    `${prefix}${Date.now().toString(36)}${(++sequence).toString(36)}`
  const day = (offset) =>
    new Date(Date.now() + 8 * 3_600_000 + offset * 86_400_000)
      .toISOString()
      .slice(0, 10)
  const rows = (table) => Object.values(snapshot[table] || {})
  const latest = (table, predicate = () => true) =>
    rows(table).filter(predicate).at(-1)
  const orders = rows('orders').filter((order) => order.sub_mchid === subMchid)
  const newestOrder = (predicate) => orders.filter(predicate).at(-1)
  const paid = (order) =>
    Boolean(order.success_time) &&
    ['SUCCESS', 'REFUND'].includes(order.trade_state)
  const refunds = rows('refunds')
  const refundAvailable = (order) =>
    order.amount.total -
    refunds
      .filter(
        (refund) =>
          refund.transaction_id === order.transaction_id &&
          refund.status !== 'CLOSED',
      )
      .reduce((sum, refund) => sum + refund.amount.refund, 0)
  const refundOrder = newestOrder(
    (order) => paid(order) && refundAvailable(order) > 0,
  )
  const queryOrder = newestOrder(() => true)
  const unpaidOrder = newestOrder(
    (order) => order.trade_state === 'NOTPAY' && !order.combine_out_trade_no,
  )
  const sharingRows = rows('profitsharing')
  const subsidies = rows('subsidies')
  const subsidyCancelled = (order) =>
    Boolean(snapshot.subsidy_cancellations?.[order.transaction_id])
  const sharingOrder = newestOrder(
    (order) =>
      paid(order) &&
      order.settle_info.profit_sharing === true &&
      !order.sharing_finished &&
      order.remaining > 0 &&
      (Number(order.settle_info.subsidy_amount || 0) === 0 ||
        subsidies.some(
          (item) => item.transaction_id === order.transaction_id,
        ) ||
        subsidyCancelled(order)),
  )
  const subsidyOrder = newestOrder(
    (order) =>
      paid(order) &&
      order.settle_info.profit_sharing === true &&
      !order.sharing_finished &&
      Number(order.settle_info.subsidy_amount || 0) > 0 &&
      !sharingRows.some(
        (item) => item.transaction_id === order.transaction_id,
      ) &&
      !subsidies.some((item) => item.transaction_id === order.transaction_id) &&
      !subsidyCancelled(order),
  )
  const cancelSubsidyOrder = newestOrder(
    (order) =>
      paid(order) &&
      order.settle_info.profit_sharing === true &&
      order.refunded > 0 &&
      !sharingRows.some(
        (item) => item.transaction_id === order.transaction_id,
      ) &&
      !subsidies.some((item) => item.transaction_id === order.transaction_id) &&
      !subsidyCancelled(order),
  )
  const latestSubsidy = latest(
    'subsidies',
    (item) => item.sub_mchid === subMchid && item.amount > item.returned,
  )
  const subsidyReturnOrder = orders.find(
    (order) => order.transaction_id === latestSubsidy?.transaction_id,
  )
  const abroadAvailable = (order) =>
    order.amount.total -
    Math.max(
      order.refunded,
      refunds
        .filter(
          (item) =>
            item.transaction_id === order.transaction_id &&
            item.status !== 'CLOSED',
        )
        .reduce((sum, item) => sum + item.amount.refund, 0),
    ) -
    rows('overseas')
      .filter(
        (item) =>
          item.transaction_id === order.transaction_id &&
          item.result !== 'FAIL',
      )
      .reduce((sum, item) => sum + item.amount, 0)
  const abroadOrder = newestOrder(
    (order) =>
      paid(order) &&
      abroadAvailable(order) > 0 &&
      (!order.settle_info.profit_sharing || order.sharing_finished),
  )
  const refund = latest('refunds', (item) => item.sub_mchid === subMchid)
  const abnormalRefund = latest(
    'refunds',
    (item) => item.sub_mchid === subMchid && item.status === 'ABNORMAL',
  )
  const advanceRefund = latest(
    'refunds',
    (item) =>
      item.sub_mchid === subMchid &&
      item.refund_account === 'REFUND_SOURCE_PARTNER_ADVANCE' &&
      item.status === 'SUCCESS',
  )
  const sharing = latest('profitsharing', (item) => item.sub_mchid === subMchid)
  const returnSharing = latest(
    'profitsharing',
    (item) =>
      item.sub_mchid === subMchid &&
      item.receivers.some(
        (receiver) =>
          receiver.type === 'MERCHANT_ID' &&
          receiver.result === 'SUCCESS' &&
          receiver.amount > receiver.returned,
      ),
  )
  const returnReceiver = returnSharing?.receivers.find(
    (receiver) =>
      receiver.type === 'MERCHANT_ID' &&
      receiver.result === 'SUCCESS' &&
      receiver.amount > receiver.returned,
  )
  const sharingReturn = latest(
    'profitsharing_returns',
    (item) => item.sub_mchid === subMchid,
  )
  const applyment = latest('applyments')
  const settlement = latest(
    'settlementApplications',
    (item) => item.sub_mchid === subMchid,
  )
  const cancellation = latest(
    'cancelWithdraws',
    (item) => item.sub_mchid === subMchid,
  )
  const legacyCancellation = latest(
    'legacyCancellations',
    (item) => item.sub_mchid === subMchid,
  )
  const riskWithdrawal = latest(
    'riskWithdrawals',
    (item) => item.sub_mchid === subMchid,
  )
  const alteration = latest(
    'subjectAlterations',
    (item) => item.merchant_code === subMchid,
  )
  const subWithdrawal = latest(
    'withdrawals',
    (item) => item.mchid === subMchid && !item.day_end,
  )
  const platformWithdrawal = latest(
    'withdrawals',
    (item) => item.mchid === spMchid && !item.day_end,
  )
  const dayWithdrawal = latest(
    'withdrawals',
    (item) => item.mchid === subMchid && item.day_end,
  )
  const overseas = latest('overseas', (item) => item.sub_mchid === subMchid)
  const combine = latest('combines', (item) => item.combine_mchid === spMchid)
  const merchant = latest('merchants', (item) => item.sub_mchid === subMchid)
  const transaction = (order) => order?.transaction_id || 'MOCK_TRANSACTION_ID'
  const orderNumber = (order) => order?.out_trade_no || 'MOCK_OUT_TRADE_NO'
  const id = (item, key, fallback) => String(item?.[key] || fallback)
  const pathId = (item, key, fallback) =>
    encodeURIComponent(id(item, key, fallback))
  const scenarios = []
  const add = (id, label, category, method, path, description, body, query) =>
    scenarios.push({
      id,
      label,
      category,
      description,
      method,
      path,
      ...(body ? { body } : {}),
      ...(query ? { query } : {}),
    })
  const queryMerchant = { sp_mchid: spMchid, sub_mchid: subMchid }
  const accountName = '联调测试有限公司'
  const accountNumber = '6222021234567890123'
  const mediaId = latest('media')?.media_id || 'test_media'
  const payeeInfo = {
    account_type: 'ACCOUNT_TYPE_CORPORATE',
    bank_account_info: {
      account_name: accountName,
      account_bank: '工商银行',
      account_number: accountNumber,
    },
  }

  function paymentBody(kind, extra = {}) {
    return {
      sp_appid: spAppid,
      sp_mchid: spMchid,
      sub_mchid: subMchid,
      description: '本地联调测试商品',
      out_trade_no: number('PAY'),
      notify_url: notifyUrl,
      amount: { total: 1000, currency: 'CNY' },
      attach: '控制台测试',
      ...(kind === 'jsapi' ? { payer: { sp_openid: 'mock-openid' } } : {}),
      ...(kind === 'h5'
        ? {
            scene_info: {
              payer_client_ip: '127.0.0.1',
              h5_info: {
                type: 'Wap',
                app_name: '本地联调',
                app_url: config.baseUrl,
              },
            },
          }
        : {}),
      ...extra,
    }
  }

  for (const [kind, label] of [
    ['jsapi', 'JSAPI / 小程序下单'],
    ['app', 'APP 下单'],
    ['native', 'Native 扫码下单'],
    ['h5', 'H5 下单'],
  ]) {
    add(
      `pay-${kind}`,
      label,
      '支付',
      'POST',
      `/v3/pay/partner/transactions/${kind}`,
      '提交后在模拟动作中支付订单；notify_url 默认接入本服务的验签解密回调接收器，可改为业务系统地址。金额单位为分。',
      paymentBody(kind),
    )
  }
  add(
    'pay-sharing',
    '分账专用下单',
    '支付',
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    '此样例开启分账；先下单并模拟支付，再请求分账或解冻。',
    paymentBody('jsapi', { settle_info: { profit_sharing: true } }),
  )
  add(
    'pay-subsidy',
    '补差专用下单',
    '支付',
    'POST',
    '/v3/pay/partner/transactions/jsapi',
    '此样例开启分账及 200 分补差；先下单并模拟支付，平台 OPERATION 账户须有足够可用余额，然后补差或先退款再取消补差。',
    paymentBody('jsapi', {
      settle_info: { profit_sharing: true, subsidy_amount: 200 },
    }),
  )
  add(
    'pay-query-id',
    '按微信支付订单号查询',
    '支付',
    'GET',
    `/v3/pay/partner/transactions/id/${pathId(newestOrder(paid), 'transaction_id', 'MOCK_TRANSACTION_ID')}`,
    '请先下单并模拟支付；未支付订单请使用商户订单号查询。',
    undefined,
    queryMerchant,
  )
  add(
    'pay-query-number',
    '按商户订单号查询',
    '支付',
    'GET',
    `/v3/pay/partner/transactions/out-trade-no/${pathId(queryOrder, 'out_trade_no', 'MOCK_OUT_TRADE_NO')}`,
    '请先下单；自动填入当前二级商户最近订单。',
    undefined,
    queryMerchant,
  )
  add(
    'pay-close',
    '关闭未支付订单',
    '支付',
    'POST',
    `/v3/pay/partner/transactions/out-trade-no/${pathId(unpaidOrder, 'out_trade_no', 'MOCK_OUT_TRADE_NO')}/close`,
    '请先创建未支付的普通订单。已支付订单不能关闭。',
    queryMerchant,
  )

  for (const [kind, label] of [
    ['jsapi', 'JSAPI / 小程序合单下单'],
    ['app', 'APP 合单下单'],
    ['native', 'Native 合单下单'],
    ['h5', 'H5 合单下单'],
  ]) {
    const body = {
      combine_appid: spAppid,
      combine_mchid: spMchid,
      combine_out_trade_no: number('COMBINE'),
      scene_info: {
        payer_client_ip: '127.0.0.1',
        device_id: 'mock-device',
        ...(kind === 'h5' ? { h5_info: { type: 'Wap' } } : {}),
      },
      sub_orders: [1, 2].map((index) => ({
        mchid: spMchid,
        sub_mchid: subMchid,
        out_trade_no: number('SUB'),
        description: `联调子订单 ${index}`,
        attach: `子订单 ${index}`,
        amount: { total_amount: 500, currency: 'CNY' },
      })),
      ...(kind === 'jsapi'
        ? { combine_payer_info: { openid: 'mock-openid' } }
        : {}),
      notify_url: notifyUrl,
    }
    add(
      `combine-${kind}`,
      label,
      '合单支付',
      'POST',
      `/v3/combine-transactions/${kind}`,
      '包含两个各 500 分的子订单。提交后使用合单支付模拟动作；子订单数组可在 JSON 中编辑。',
      body,
    )
  }
  add(
    'combine-query',
    '查询合单订单',
    '合单支付',
    'GET',
    `/v3/combine-transactions/out-trade-no/${pathId(combine, 'combine_out_trade_no', 'MOCK_COMBINE_NO')}`,
    '请先创建合单订单。',
  )
  const closableCombine = latest(
    'combines',
    (item) =>
      item.combine_mchid === spMchid &&
      item.order_keys.every(
        (key) => snapshot.orders?.[key]?.trade_state === 'NOTPAY',
      ),
  )
  add(
    'combine-close',
    '关闭合单订单',
    '合单支付',
    'POST',
    `/v3/combine-transactions/out-trade-no/${pathId(closableCombine, 'combine_out_trade_no', 'MOCK_COMBINE_NO')}/close`,
    '请先创建未支付的合单；须提交全部子订单，JSON 可编辑。',
    {
      combine_appid: spAppid,
      sub_orders: closableCombine
        ? closableCombine.order_keys.map((key) => ({
            mchid: spMchid,
            sub_mchid: snapshot.orders[key].sub_mchid,
            out_trade_no: snapshot.orders[key].out_trade_no,
          }))
        : [
            {
              mchid: spMchid,
              sub_mchid: subMchid,
              out_trade_no: 'MOCK_SUB_TRADE_NO',
            },
          ],
    },
  )

  const refundAmount = Math.min(
    100,
    refundOrder ? refundAvailable(refundOrder) : 100,
  )
  const refundBody = () => ({
    sp_appid: refundOrder?.sp_appid || spAppid,
    sub_mchid: subMchid,
    out_trade_no: orderNumber(refundOrder),
    out_refund_no: number('REFUND'),
    reason: '控制台退款测试',
    notify_url: notifyUrl,
    amount: {
      total: refundOrder?.amount.total || 1000,
      refund: refundAmount,
      currency: 'CNY',
    },
  })
  add(
    'refund-apply',
    '申请普通退款',
    '退款',
    'POST',
    '/v3/ecommerce/refunds/apply',
    '请先下单并模拟支付，自动选择仍有可退金额的最近订单。默认退 100 分；amount.total 必须保持原支付金额。',
    refundBody(),
  )
  add(
    'refund-advance',
    '申请平台垫付退款',
    '退款',
    'POST',
    '/v3/ecommerce/refunds/apply',
    '请先支付普通订单，给平台 BASIC 账户充值，再将二级商户 BASIC 可用余额设为不足。仅二级商户无法出资时会由平台垫付；成功后可补足二级商户余额测试回补。',
    { ...refundBody(), refund_account: 'REFUND_SOURCE_PARTNER_ADVANCE' },
  )
  add(
    'refund-query-id',
    '按微信退款单号查询',
    '退款',
    'GET',
    `/v3/ecommerce/refunds/id/${pathId(refund, 'refund_id', 'MOCK_REFUND_ID')}`,
    '请先申请退款。',
    undefined,
    { sub_mchid: subMchid },
  )
  add(
    'refund-query-number',
    '按商户退款单号查询',
    '退款',
    'GET',
    `/v3/ecommerce/refunds/out-refund-no/${pathId(refund, 'out_refund_no', 'MOCK_OUT_REFUND_NO')}`,
    '请先申请退款。',
    undefined,
    { sub_mchid: subMchid },
  )
  add(
    'refund-abnormal',
    '发起异常退款至用户银行卡',
    '退款',
    'POST',
    `/v3/ecommerce/refunds/${pathId(abnormalRefund, 'refund_id', 'MOCK_ABNORMAL_REFUND_ID')}/apply-abnormal-refund`,
    '先关闭自动完成，申请退款，再用退款完成动作将 status 改为 ABNORMAL。out_refund_no 必须与原退款单相同；敏感明文由代理加密。',
    {
      sub_mchid: subMchid,
      out_refund_no: id(abnormalRefund, 'out_refund_no', 'MOCK_OUT_REFUND_NO'),
      type: 'USER_BANK_CARD',
      bank_type: 'ICBC_DEBIT',
      bank_account: accountNumber,
      real_name: '张三',
    },
  )
  add(
    'refund-return-advance',
    '垫付退款回补',
    '退款',
    'POST',
    `/v3/ecommerce/refunds/${pathId(advanceRefund, 'refund_id', 'MOCK_ADVANCE_REFUND_ID')}/return-advance`,
    '请先完成平台垫付退款，再给二级商户 BASIC 账户补足可用余额；余额不足时结果保持 PROCESSING，可原单重试。',
    { sub_mchid: subMchid },
  )
  add(
    'refund-query-advance',
    '查询垫付回补结果',
    '退款',
    'GET',
    `/v3/ecommerce/refunds/${pathId(advanceRefund, 'refund_id', 'MOCK_ADVANCE_REFUND_ID')}/return-advance`,
    '请先成功完成平台垫付退款并发起回补。',
    undefined,
    { sub_mchid: subMchid },
  )

  add(
    'profitsharing-create',
    '请求分账',
    '分账与补差',
    'POST',
    '/v3/ecommerce/profitsharing/orders',
    '先使用分账专用样例下单并支付；带补差标识的订单先补差或取消补差。默认分 100 分给平台，finish=false 保留剩余待分资金。',
    {
      sub_mchid: subMchid,
      transaction_id: transaction(sharingOrder),
      out_order_no: number('SHARE'),
      receivers: [
        {
          type: 'MERCHANT_ID',
          receiver_account: spMchid,
          receiver_name: accountName,
          amount: Math.min(100, sharingOrder?.remaining || 100),
          description: '平台佣金',
        },
      ],
      finish: false,
      notify_url: notifyUrl,
    },
  )
  add(
    'profitsharing-query',
    '查询分账结果',
    '分账与补差',
    'GET',
    '/v3/ecommerce/profitsharing/orders',
    '请先请求分账；关闭自动完成时可用分账完成动作模拟成功或失败。',
    undefined,
    {
      sub_mchid: subMchid,
      transaction_id: sharing?.transaction_id || 'MOCK_TRANSACTION_ID',
      out_order_no: id(sharing, 'out_order_no', 'MOCK_SHARE_NO'),
    },
  )
  add(
    'profitsharing-amounts',
    '查询剩余待分金额',
    '分账与补差',
    'GET',
    `/v3/ecommerce/profitsharing/orders/${encodeURIComponent(transaction(sharingOrder || newestOrder(paid)))}/amounts`,
    '请先创建已支付订单；本查询不会推动分账状态。',
    undefined,
    { sub_mchid: subMchid },
  )
  add(
    'profitsharing-finish',
    '解冻剩余资金',
    '分账与补差',
    'POST',
    '/v3/ecommerce/profitsharing/finish-order',
    '请先支付开启分账的订单，并完成所有处理中分账。此操作完结分账，将剩余待分金额解冻到二级商户可用余额。',
    {
      sub_mchid: subMchid,
      transaction_id: transaction(sharingOrder),
      out_order_no: number('FINISH'),
      description: '控制台完结分账',
    },
  )
  add(
    'profitsharing-return',
    '请求分账回退',
    '分账与补差',
    'POST',
    '/v3/ecommerce/profitsharing/returnorders',
    '先完成一笔商户接收方分账，接收方可用余额和剩余可回退金额须足够。默认回退 50 分。',
    {
      sub_mchid: subMchid,
      out_order_no: id(returnSharing, 'out_order_no', 'MOCK_SHARE_NO'),
      out_return_no: number('RETURN'),
      return_mchid: returnReceiver?.receiver_account || spMchid,
      amount: Math.min(
        50,
        returnReceiver ? returnReceiver.amount - returnReceiver.returned : 50,
      ),
      description: '退款分账回退',
    },
  )
  add(
    'profitsharing-return-query',
    '查询分账回退结果',
    '分账与补差',
    'GET',
    '/v3/ecommerce/profitsharing/returnorders',
    '请先请求分账回退。',
    undefined,
    {
      sub_mchid: subMchid,
      out_order_no: id(sharingReturn, 'out_order_no', 'MOCK_SHARE_NO'),
      out_return_no: id(sharingReturn, 'out_return_no', 'MOCK_RETURN_NO'),
    },
  )
  add(
    'receiver-add',
    '添加分账接收方',
    '分账与补差',
    'POST',
    '/v3/ecommerce/profitsharing/receivers/add',
    '可编辑 account 为另一商户；非平台、非原二级商户的接收方须先添加关系再分账。',
    {
      appid: spAppid,
      type: 'MERCHANT_ID',
      account: '1900000200',
      name: '联调供应商有限公司',
      relation_type: 'SUPPLIER',
    },
  )
  add(
    'receiver-delete',
    '删除分账接收方',
    '分账与补差',
    'POST',
    '/v3/ecommerce/profitsharing/receivers/delete',
    '删除与当前 appid 对应的分账接收关系。',
    { appid: spAppid, type: 'MERCHANT_ID', account: '1900000200' },
  )
  add(
    'subsidy-create',
    '请求补差',
    '分账与补差',
    'POST',
    '/v3/ecommerce/subsidies/create',
    '使用补差专用样例下单并支付；先给平台 OPERATION 账户充值。分账前补差金额须等于下单 subsidy_amount（退款后允许更少）。',
    {
      sub_mchid: subMchid,
      transaction_id: transaction(subsidyOrder),
      amount: Number(subsidyOrder?.settle_info.subsidy_amount || 200),
      description: '平台优惠补贴',
      out_subsidy_no: number('SUBSIDY'),
    },
  )
  add(
    'subsidy-return',
    '请求补差回退',
    '分账与补差',
    'POST',
    '/v3/ecommerce/subsidies/return',
    '请先成功补差；自动匹配最近仍可回退补差。分账完结后资金源为 AVAILABLE，完结前为 UNAVAILABLE。',
    {
      sub_mchid: subMchid,
      transaction_id: transaction(subsidyReturnOrder),
      out_order_no: number('SUBRETURN'),
      amount: Math.min(
        50,
        latestSubsidy ? latestSubsidy.amount - latestSubsidy.returned : 50,
      ),
      description: '优惠补贴回退',
      from: [
        {
          account: subsidyReturnOrder?.sharing_finished
            ? 'AVAILABLE'
            : 'UNAVAILABLE',
          amount: Math.min(
            50,
            latestSubsidy ? latestSubsidy.amount - latestSubsidy.returned : 50,
          ),
        },
      ],
    },
  )
  add(
    'subsidy-cancel',
    '取消补差',
    '分账与补差',
    'POST',
    '/v3/ecommerce/subsidies/cancel',
    '使用补差专用样例下单并支付，先申请部分退款；须尚未补差和分账，取消后才能继续分账。',
    {
      sub_mchid: subMchid,
      transaction_id: transaction(cancelSubsidyOrder),
      description: '订单退款后取消补差',
    },
  )

  add(
    'balance-sub',
    '查询二级商户实时余额',
    '余额与提现',
    'GET',
    `/v3/ecommerce/fund/balance/${encodeURIComponent(subMchid)}`,
    '金额单位为分；可通过账户模拟设置不同账户余额。',
    undefined,
    { account_type: 'BASIC' },
  )
  add(
    'balance-sub-endday',
    '查询二级商户日终余额',
    '余额与提现',
    'GET',
    `/v3/ecommerce/fund/enddaybalance/${encodeURIComponent(subMchid)}`,
    '日期按北京时间生成，日终首次查询后固定快照。',
    undefined,
    { date: day(-1), account_type: 'BASIC' },
  )
  add(
    'balance-platform',
    '查询平台实时余额',
    '余额与提现',
    'GET',
    '/v3/merchant/fund/balance/BASIC',
    '将路径中的 BASIC 改为 OPERATION 或 FEES 可查询对应账户。',
  )
  add(
    'balance-platform-endday',
    '查询平台日终余额',
    '余额与提现',
    'GET',
    '/v3/merchant/fund/dayendbalance/BASIC',
    '日期按北京时间生成；平台支持 BASIC、OPERATION、FEES。',
    undefined,
    { date: day(-1) },
  )
  add(
    'withdraw-sub',
    '二级商户预约提现',
    '余额与提现',
    'POST',
    '/v3/ecommerce/fund/withdraw',
    '请先给二级商户 BASIC 账户充值。关闭自动完成后，可模拟成功、失败和银行退票。',
    {
      sub_mchid: subMchid,
      out_request_no: number('WITHDRAW'),
      amount: 100,
      notify_url: notifyUrl,
      remark: '本地联调提现',
    },
  )
  add(
    'withdraw-sub-query-id',
    '按微信单号查询二级商户提现',
    '余额与提现',
    'GET',
    `/v3/ecommerce/fund/withdraw/${pathId(subWithdrawal, 'withdraw_id', 'MOCK_WITHDRAW_ID')}`,
    '请先申请二级商户预约提现。',
    undefined,
    { sub_mchid: subMchid },
  )
  add(
    'withdraw-sub-query-number',
    '按业务单号查询二级商户提现',
    '余额与提现',
    'GET',
    `/v3/ecommerce/fund/withdraw/out-request-no/${pathId(subWithdrawal, 'out_request_no', 'MOCK_WITHDRAW_NO')}`,
    '请先申请二级商户预约提现。',
    undefined,
    { sub_mchid: subMchid },
  )
  add(
    'withdraw-platform',
    '平台预约提现',
    '余额与提现',
    'POST',
    '/v3/merchant/fund/withdraw',
    '请先给平台对应账户充值；amount 单位为分。',
    {
      out_request_no: number('PLATWITH'),
      amount: 100,
      account_type: 'BASIC',
      notify_url: notifyUrl,
      remark: '本地联调平台提现',
    },
  )
  add(
    'withdraw-platform-query-id',
    '按微信单号查询平台提现',
    '余额与提现',
    'GET',
    `/v3/merchant/fund/withdraw/withdraw-id/${pathId(platformWithdrawal, 'withdraw_id', 'MOCK_WITHDRAW_ID')}`,
    '请先申请平台预约提现。',
  )
  add(
    'withdraw-platform-query-number',
    '按业务单号查询平台提现',
    '余额与提现',
    'GET',
    `/v3/merchant/fund/withdraw/out-request-no/${pathId(platformWithdrawal, 'out_request_no', 'MOCK_WITHDRAW_NO')}`,
    '请先申请平台预约提现。',
  )
  add(
    'withdraw-day-end',
    '按日终余额预约提现',
    '余额与提现',
    'POST',
    '/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw',
    '先为二级商户设置可用余额，再查询昨日快照；默认允许按当前余额扣款、留存 100 分。留存额须小于可提现金额。',
    {
      sub_mchid: subMchid,
      out_request_no: number('DAYWITH'),
      calculate_amount_type: 'ALLOW_CURRENT_BALANCE',
      reserve_amount: 100,
      notify_url: notifyUrl,
    },
  )
  add(
    'withdraw-day-end-query',
    '查询日终余额预约提现',
    '余额与提现',
    'GET',
    `/v3/platsolution/ecommerce/withdraw/day-end-balance-withdraw/out-request-no/${pathId(dayWithdrawal, 'out_request_no', 'MOCK_DAY_WITHDRAW_NO')}`,
    '请先申请按日终余额预约提现。',
    undefined,
    { sub_mchid: subMchid },
  )
  add(
    'withdraw-exception-bill',
    '申请提现异常文件',
    '账单',
    'GET',
    '/v3/merchant/fund/withdraw/bill-type/NO_SUCC',
    '先模拟提现失败、异常或退票。响应中的 download_url 可打开下载。',
    undefined,
    { bill_date: day(0) },
  )
  add(
    'bill-trade',
    '申请交易账单',
    '账单',
    'GET',
    '/v3/bill/tradebill',
    '默认申请北京时间今日交易账单。响应中的 download_url 可下载 CSV；tar_type 可改为 GZIP。',
    undefined,
    { bill_date: day(0), sub_mchid: subMchid, bill_type: 'ALL' },
  )
  add(
    'bill-fund',
    '申请平台资金账单',
    '账单',
    'GET',
    '/v3/bill/fundflowbill',
    '包含平台实际资金流水；响应中的 download_url 可下载 CSV。',
    undefined,
    { bill_date: day(0), account_type: 'BASIC' },
  )
  add(
    'bill-sharing',
    '申请分账账单',
    '账单',
    'GET',
    '/v3/profitsharing/bills',
    '请先完成分账；下载链接有效期较短，应及时下载。',
    undefined,
    { bill_date: day(0), sub_mchid: subMchid },
  )
  add(
    'bill-subfund',
    '申请二级商户加密资金账单',
    '账单',
    'GET',
    '/v3/ecommerce/bill/fundflowbill',
    '返回加密账单列表。encrypt_key 使用商户 RSA 私钥解密，文件使用 AES-256-GCM 解密；可用于 SDK 加密账单联调。',
    undefined,
    { bill_date: day(0), account_type: 'ALL', algorithm: 'AEAD_AES_256_GCM' },
  )
  add(
    'bill-download',
    '下载已申请账单',
    '账单',
    'GET',
    '/v3/billdownload/file',
    '请先申请账单；自动填入最近有效账单 token，也可复制响应下载链接中的 token。',
    undefined,
    {
      token:
        Object.entries(snapshot.bills || {})
          .filter(([, bill]) => bill.expires_at > Date.now())
          .at(-1)?.[0] || 'MOCK_BILL_TOKEN',
    },
  )

  const cardInfo = {
    id_card_copy: mediaId,
    id_card_national: mediaId,
    id_card_name: '张三',
    id_card_number: '110101199001010011',
    id_card_valid_time_begin: '2020-01-01',
    id_card_valid_time: '长期',
  }
  const applymentBody = {
    out_request_no: number('APPLY'),
    organization_type: '2',
    merchant_shortname: '控制台测试店铺',
    business_license_info: {
      business_license_copy: mediaId,
      business_license_number: '91440300MA5MOCK002',
      merchant_name: accountName,
      legal_person: '张三',
    },
    finance_institution: false,
    id_doc_type: 'IDENTIFICATION_TYPE_MAINLAND_IDCARD',
    id_holder_type: 'LEGAL',
    id_card_info: cardInfo,
    account_info: {
      bank_account_type: '74',
      account_name: accountName,
      account_bank: '工商银行',
      account_number: accountNumber,
    },
    contact_info: {
      contact_type: '65',
      contact_name: '张三',
      mobile_phone: '13800138000',
    },
    sales_scene_info: {
      store_name: '控制台测试店铺',
      store_url: 'https://example.test/shop',
    },
  }
  add(
    'applyment-create',
    '企业商户完整进件',
    '商户进件',
    'POST',
    '/v3/ecommerce/applyments',
    '可直接提交完整企业示例；建议先上传文件并替换证件 media_id。模拟器也接受 test_media 占位。关闭自动完成后可模拟账户验证、审核、签约和驳回重提。',
    applymentBody,
  )
  add(
    'applyment-micro',
    '小微商户完整进件',
    '商户进件',
    'POST',
    '/v3/ecommerce/applyments',
    '小微主体使用个人银行卡和经营者超级管理员；不提交企业营业执照。建议上传文件替换证件 media_id。',
    {
      out_request_no: number('MICRO'),
      organization_type: '2401',
      merchant_shortname: '小微测试店铺',
      id_card_info: { ...cardInfo },
      account_info: {
        bank_account_type: '75',
        account_name: '张三',
        account_bank: '工商银行',
        account_number: accountNumber,
      },
      contact_info: {
        contact_type: '65',
        contact_name: '张三',
        mobile_phone: '13800138000',
      },
      sales_scene_info: {
        store_name: '小微测试店铺',
        store_url: 'https://example.test/shop',
      },
    },
  )
  add(
    'applyment-query-id',
    '按申请单 ID 查询进件',
    '商户进件',
    'GET',
    `/v3/ecommerce/applyments/${pathId(applyment, 'applyment_id', 'MOCK_APPLYMENT_ID')}`,
    '请先提交进件申请；自动选择最近申请。',
  )
  add(
    'applyment-query-number',
    '按业务编号查询进件',
    '商户进件',
    'GET',
    `/v3/ecommerce/applyments/out-request-no/${pathId(applyment, 'out_request_no', 'MOCK_APPLYMENT_NO')}`,
    '请先提交进件申请。',
  )
  add(
    'settlement-modify',
    '修改结算账户',
    '商户进件',
    'POST',
    `/v3/apply4sub/sub_merchants/${encodeURIComponent(subMchid)}/modify-settlement`,
    '敏感明文由代理自动加密。关闭自动完成后须使用结算审核动作通过，才替换商户结算账户。',
    {
      account_type: 'ACCOUNT_TYPE_BUSINESS',
      account_bank: '建设银行',
      account_name: accountName,
      account_number: accountNumber,
    },
  )
  add(
    'settlement-query',
    '查询结算账户',
    '商户进件',
    'GET',
    `/v3/apply4sub/sub_merchants/${encodeURIComponent(subMchid)}/settlement`,
    '默认返回掩码；account_number_rule 可改为 ACCOUNT_NUMBER_RULE_MASK_V2。',
    undefined,
    { account_number_rule: 'ACCOUNT_NUMBER_RULE_MASK_V1' },
  )
  add(
    'settlement-query-application',
    '查询结算账户修改申请',
    '商户进件',
    'GET',
    `/v3/apply4sub/sub_merchants/${encodeURIComponent(subMchid)}/application/${pathId(settlement, 'application_no', 'MOCK_SETTLEMENT_APPLICATION_NO')}`,
    '请先提交结算账户修改申请。',
    undefined,
    { account_number_rule: 'ACCOUNT_NUMBER_RULE_MASK_V1' },
  )

  // 控制台代理会把文件字节转换为官方接口所需 multipart，并计算摘要。
  const tinyPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII='
  add(
    'media-upload',
    '上传进件文件',
    '商户进件',
    'POST',
    '/v3/merchant/media/upload',
    '内置 1×1 PNG 样例，控制台代理转换为 multipart 并计算 SHA256。可替换 file.name 与 file.content_base64；也可使用工作台的文件上传控件。',
    {
      file: {
        name: 'console-test.png',
        type: 'image/png',
        content_base64: tinyPng,
      },
    },
  )
  add(
    'cancel-media-upload',
    '上传旧注销图片',
    '商户注销',
    'POST',
    '/v3/ecommerce/account/cancel-applications/media',
    '内置 PNG 样例；代理转换为旧接口 meta.file_name / file_digest。旧注销图片仅支持 JPG、BMP、PNG，最大 2 MB。',
    {
      file: {
        name: 'cancel-test.png',
        type: 'image/png',
        content_base64: tinyPng,
      },
    },
  )
  add(
    'subject-merchants',
    '按主体查询商户列表',
    '商户注销',
    'GET',
    '/v3/ecommerce/subject-sub-merchants',
    '自动使用当前二级商户主体类型及证件号；修改主体后请重新加载样例。cert_number 由代理加密。',
    undefined,
    {
      organization_type:
        {
          2: 'SUBJECT_TYPE_ENTERPRISE',
          4: 'SUBJECT_TYPE_INDIVIDUAL',
          3: 'SUBJECT_TYPE_INSTITUTIONS_CLONED',
          2502: 'SUBJECT_TYPE_GOVERNMENT',
          1708: 'SUBJECT_TYPE_OTHERS',
          2401: 'SUBJECT_TYPE_MICRO',
          2500: 'SUBJECT_TYPE_MICRO',
        }[merchant?.organization_type] ||
        merchant?.organization_type ||
        'SUBJECT_TYPE_ENTERPRISE',
      cert_number: merchant?.cert_number || '91440300MA5MOCK001',
      limit: 20,
      offset: 0,
    },
  )
  add(
    'cancel-validate',
    '商户注销资格校验',
    '商户注销',
    'GET',
    `/v3/ecommerce/account/apply-cancel-withdraw/validate-cancel/${encodeURIComponent(subMchid)}`,
    '冻结资金、未处理投诉或商户管控会阻断注销；可通过商户模拟动作设置 block_reasons。',
  )
  add(
    'cancel-withdraw-create',
    '提交新流程注销及提现',
    '商户注销',
    'POST',
    '/v3/ecommerce/account/apply-cancel-withdraw',
    '先确保无冻结资金或注销阻断。新流程将注销商户并清退账户余额；关闭自动完成可模拟商户确认和银行退票。',
    {
      sub_mchid: subMchid,
      out_request_no: number('CANCELNEW'),
      withdraw: 'APPLY_WITHDRAW',
      payee_info: structuredClone(payeeInfo),
    },
  )
  add(
    'cancel-withdraw-query-id',
    '按微信单号查询新流程注销',
    '商户注销',
    'GET',
    `/v3/ecommerce/account/apply-cancel-withdraw/applyment-id/${pathId(cancellation, 'applyment_id', 'MOCK_CANCEL_APPLYMENT_ID')}`,
    '请先提交新流程注销申请。',
  )
  add(
    'cancel-withdraw-query-number',
    '按业务单号查询新流程注销',
    '商户注销',
    'GET',
    `/v3/ecommerce/account/apply-cancel-withdraw/out-request-no/${pathId(cancellation, 'out_request_no', 'MOCK_CANCEL_REQUEST_NO')}`,
    '请先提交新流程注销申请。',
  )
  add(
    'cancel-legacy-create',
    '提交旧流程注销申请',
    '商户注销',
    'POST',
    '/v3/ecommerce/account/cancel-applications',
    '先确保无冻结资金。建议先上传旧注销图片，再替换 application_media_id；成功后可测试旧流程注销后提现。',
    {
      sub_mchid: subMchid,
      out_apply_no: number('CANCELOLD'),
      application_info: [
        {
          application_type: 'SP_CANCEL_ACCOUNT_APPLICATION',
          application_media_id: mediaId,
        },
      ],
    },
  )
  add(
    'cancel-legacy-query',
    '查询旧流程注销状态',
    '商户注销',
    'GET',
    `/v3/ecommerce/account/cancel-applications/out-apply-no/${pathId(legacyCancellation, 'out_apply_no', 'MOCK_CANCEL_APPLY_NO')}`,
    '请先提交旧流程注销申请。',
  )
  add(
    'cancel-risk-withdraw-create',
    '已注销商户余额提现',
    '商户注销',
    'POST',
    '/v3/mch_operate/risk/withdrawl-apply',
    '先通过旧流程注销商户并保留可用余额，再申请注销后提现。可模拟审核失败或银行退票。',
    {
      sub_mchid: subMchid,
      out_account_type: 'BASIC_ACCOUNT',
      amount: 100,
      out_request_no: number('RISKWITH'),
      payee_type: 'CONTRIBUTION_MERCHANT',
      payee_mchid: subMchid,
      payee_info: structuredClone(payeeInfo),
    },
  )
  add(
    'cancel-risk-withdraw-query-id',
    '按微信单号查询注销后提现',
    '商户注销',
    'GET',
    `/v3/mch_operate/risk/withdrawl-apply/applyment-id/${pathId(riskWithdrawal, 'applyment_id', 'MOCK_RISK_APPLYMENT_ID')}`,
    '请先提交注销后提现申请。',
  )
  add(
    'cancel-risk-withdraw-query-number',
    '按业务单号查询注销后提现',
    '商户注销',
    'GET',
    `/v3/mch_operate/risk/withdrawl-apply/out-request-no/${pathId(riskWithdrawal, 'out_request_no', 'MOCK_RISK_REQUEST_NO')}`,
    '请先提交注销后提现申请。',
  )

  add(
    'subject-alter-create',
    '提交完整主体变更',
    '主体变更',
    'POST',
    '/v3/mchalterapply/mchsubjectalterapplyment',
    '提供营业执照和法人证件的完整企业变更样例；敏感明文自动加密。关闭自动完成可测试驳回、修正重提、完成及撤销。',
    {
      merchant_code: subMchid,
      out_request_no: number('SUBJECT'),
      alter_scope: 'ALTER_SCOPE_FULL',
      organization_type: 'SUBJECT_TYPE_ENTERPRISE',
      finance_institution: false,
      business_license_info: {
        license_number: '91440300MA5NEW00001',
        license_copy: mediaId,
        merchant_name: '新的联调测试有限公司',
        legal_person: '李四',
      },
      legal_person_info: {
        id_holder_type: 'LEGAL',
        id_doc_type: 'IDENTIFICATION_TYPE_IDCARD',
        card_front: mediaId,
        card_back: mediaId,
        card_name: '李四',
        card_number: '110101199001010011',
        card_address: '广东省深圳市联调测试地址',
        card_period_begin: '2020-01-01',
        card_period_end: '长期',
        as_ubo: true,
      },
    },
  )
  add(
    'subject-alter-query-id',
    '按申请单号查询主体变更',
    '主体变更',
    'GET',
    `/v3/mchalterapply/mchsubjectalterapplyment/${pathId(alteration, 'apply_id', 'MOCK_SUBJECT_APPLY_ID')}`,
    '请先提交主体变更申请。',
  )
  add(
    'subject-alter-query-number',
    '按业务单号查询主体变更',
    '主体变更',
    'GET',
    `/v3/mchalterapply/mchsubjectalterapplyment/merchant/${encodeURIComponent(subMchid)}/out-request-no/${pathId(alteration, 'out_request_no', 'MOCK_SUBJECT_REQUEST_NO')}`,
    '请先提交主体变更申请。',
  )
  add(
    'subject-alter-revoke',
    '撤销主体变更申请',
    '主体变更',
    'POST',
    `/v3/mchalterapply/mchsubjectalterapplyment/${pathId(alteration, 'apply_id', 'MOCK_SUBJECT_APPLY_ID')}/revoke`,
    '请先关闭自动完成并提交主体变更。仅尚未完成、处于可撤销阶段的申请可撤销。',
    {},
  )

  add(
    'overseas-available',
    '查询订单可出境余额',
    '跨境付款',
    'GET',
    `/v3/funds-to-oversea/transactions/${encodeURIComponent(transaction(abroadOrder))}/available_abroad_amounts`,
    '请先支付普通订单；开启分账的订单须先解冻，退款和已申请出境金额会占用订单额度。',
    undefined,
    { sub_mchid: subMchid },
  )
  add(
    'overseas-create',
    '申请资金出境',
    '跨境付款',
    'POST',
    '/v3/funds-to-oversea/orders',
    '请先支付普通订单，二级商户 BASIC 可用余额须足够。提供商品、境外店铺、收款人及物流完整样例；复杂数组可编辑 JSON。',
    {
      out_order_id: number('ABROAD'),
      sub_mchid: subMchid,
      transaction_id: transaction(abroadOrder),
      amount: Math.min(100, abroadOrder ? abroadAvailable(abroadOrder) : 100),
      foreign_currency: 'USD',
      goods_info: [
        {
          goods_name: '联调测试商品',
          goods_category: '服饰',
          goods_unit_price: 100,
          goods_quantity: 1,
        },
      ],
      seller_info: {
        oversea_business_name: 'Mock Trading Ltd',
        oversea_shop_name: 'Mock Store',
        seller_id: 'MOCKSELLER01',
      },
      express_info: {
        courier_number: 'MOCKEXPRESS01',
        express_company_name: 'MOCK',
      },
      payee_info: { payee_id: 'MOCKPAYEE01' },
    },
  )
  add(
    'overseas-query',
    '查询资金出境结果',
    '跨境付款',
    'GET',
    `/v3/funds-to-oversea/orders/${pathId(overseas, 'out_order_id', 'MOCK_OVERSEAS_ORDER_ID')}`,
    '请先申请资金出境；transaction_id 必须与原出境申请对应订单相同。',
    undefined,
    {
      sub_mchid: subMchid,
      transaction_id: overseas?.transaction_id || 'MOCK_TRANSACTION_ID',
    },
  )
  add(
    'overseas-bill',
    '申请购付汇账单下载链接',
    '跨境付款',
    'GET',
    '/v3/funds-to-oversea/bill-download-url',
    '先完成资金出境；默认申请北京时间今日账单。',
    undefined,
    { bill_date: day(0) },
  )
  add(
    'certificates',
    '下载测试平台证书',
    '联调工具',
    'GET',
    '/v3/certificates',
    '额外兼容接口，证书使用 APIv3 密钥加密，可用于 SDK 证书更新联调。',
  )

  const pendingRefund =
    latest(
      'refunds',
      (item) => item.sub_mchid === subMchid && item.status === 'PROCESSING',
    ) || refund
  const pendingSharing =
    latest(
      'profitsharing',
      (item) => item.sub_mchid === subMchid && item.status === 'PROCESSING',
    ) || sharing
  const pendingWithdrawal =
    latest('withdrawals', (item) =>
      ['CREATE_SUCCESS', 'PROCESSING'].includes(item.status),
    ) || latest('withdrawals')
  const pendingOverseas =
    latest(
      'overseas',
      (item) => item.sub_mchid === subMchid && item.result === 'ACCEPT',
    ) || overseas
  const actions = [
    {
      id: 'pay',
      label: '模拟支付普通订单',
      body: {
        sub_mchid: subMchid,
        out_trade_no: orderNumber(unpaidOrder || queryOrder),
      },
    },
    {
      key: 'pay-combine',
      id: 'pay',
      label: '模拟支付合单订单',
      body: {
        combine_out_trade_no: id(
          combine,
          'combine_out_trade_no',
          'MOCK_COMBINE_NO',
        ),
      },
    },
    {
      id: 'complete-refund',
      label: '完成退款（SUCCESS / CLOSED / ABNORMAL）',
      body: {
        sub_mchid: subMchid,
        refund_id: id(pendingRefund, 'refund_id', 'MOCK_REFUND_ID'),
        status: 'SUCCESS',
      },
    },
    {
      id: 'complete-profitsharing',
      label: '完成分账（success 可改为 false）',
      body: {
        sub_mchid: subMchid,
        out_order_no: id(pendingSharing, 'out_order_no', 'MOCK_SHARE_NO'),
        success: true,
        fail_reason: 'ACCOUNT_ABNORMAL',
      },
    },
    {
      id: 'complete-withdrawal',
      label: '完成提现（SUCCESS / FAIL / REFUND）',
      body: {
        withdraw_id: id(pendingWithdrawal, 'withdraw_id', 'MOCK_WITHDRAW_ID'),
        status: 'SUCCESS',
        reason: '模拟银行退票',
      },
    },
    {
      id: 'complete-overseas',
      label: '完成资金出境（success 可改为 false）',
      body: {
        sub_mchid: subMchid,
        out_order_id: id(
          pendingOverseas,
          'out_order_id',
          'MOCK_OVERSEAS_ORDER_ID',
        ),
        success: true,
        fail_reason: 'SYSTEM_ERROR',
      },
    },
    {
      id: 'merchant',
      label: '种子商户 / 商户元资料',
      body: {
        sub_mchid: subMchid,
        organization_type: '2',
        cert_number: '91440300MA5MOCK001',
        merchant_name: accountName,
        legal_person: '张三',
        merchant_shortname: '联调测试商户',
        merchant_state: 'NORMAL',
        block_reasons: [],
      },
    },
    {
      id: 'applyment',
      label: '进件审核（FINISH / REJECTED / NEED_SIGN 等）',
      body: {
        applyment_id: id(applyment, 'applyment_id', 'MOCK_APPLYMENT_ID'),
        state: 'FINISH',
        reason: '模拟证件不清晰',
      },
    },
    {
      id: 'settlement',
      label: '结算审核（AUDIT_SUCCESS / AUDIT_FAIL）',
      body: {
        application_no: id(
          settlement,
          'application_no',
          'MOCK_SETTLEMENT_APPLICATION_NO',
        ),
        state: 'AUDIT_SUCCESS',
        reason: '模拟结算账户不匹配',
      },
    },
    {
      id: 'cancel-withdraw',
      label: '新注销审核（确认 / 处理 / FINISH）',
      body: {
        applyment_id: id(
          cancellation,
          'applyment_id',
          'MOCK_CANCEL_APPLYMENT_ID',
        ),
        state: 'FINISH',
      },
    },
    {
      id: 'cancel',
      label: '旧注销审核（CANCEL_SUCCESS / REJECTED）',
      body: {
        out_apply_no: id(
          legacyCancellation,
          'out_apply_no',
          'MOCK_CANCEL_APPLY_NO',
        ),
        state: 'CANCEL_SUCCESS',
        reason: '模拟注销资料有误',
      },
    },
    {
      id: 'cancel-withdrawal',
      label: '注销后提现（PAY_SUCCEED / BANK_REFUNDED）',
      body: {
        applyment_id: id(
          riskWithdrawal,
          'applyment_id',
          'MOCK_RISK_APPLYMENT_ID',
        ),
        state: 'PAY_SUCCEED',
        reason: '模拟银行退票',
      },
    },
    {
      id: 'subject-alter',
      label: '主体变更审核（完成 / 驳回）',
      body: {
        apply_id: id(alteration, 'apply_id', 'MOCK_SUBJECT_APPLY_ID'),
        state: 'APPLYMENT_STATE_FINISHED',
        reason: '模拟证件错误',
      },
    },
  ]
  return { scenarios, actions }
}
