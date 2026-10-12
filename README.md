# 平台收付通联调模拟服务

基于当前目录的“平台收付通-电商交易解决方案”官方文档，使用 Hono、TypeScript 和 Node.js 实现。覆盖文档中 **74 个不同的服务端方法/路径**，小程序复用 JSAPI；额外支持平台证书下载、本地 H5 收银台和测试控制接口。完整清单见 [接口覆盖表](docs/api-coverage.md)。

## 启动

需要 Node.js 24 与 pnpm。在 PowerShell 中执行：

```powershell
pnpm install
pnpm dev
```

服务地址为 `http://127.0.0.1:3000`。默认宽松模式，无需 Authorization；仍然校验必填参数、类型、金额、状态、商户归属和业务单号。所有官方 JSON 应答、错误和通知都带真实 RSA 签名。

## 网页控制台

启动后在浏览器打开 **http://127.0.0.1:3000/**（或 `/console`），即可操作本地控制台，无需额外前端服务或联网下载网页资源。原服务信息 JSON 改在 `GET /mock/info`。

- **联调总览**：查看订单、交易金额、资金账户、回调送达情况；从最近订单直接模拟支付。
- **场景模拟**：选择普通/合单支付、退款、分账、进件、补差、提现、跨境、账单等预置，修改表单和高级 JSON；运行完整交易链路，每一步都展示真实 HTTP 响应。
- **接口工作台**：搜索并选择全部 74 个文档接口，编辑路径参数、查询串、请求头和 JSON；支持上传文件、下载账单、复制请求及 PowerShell `curl.exe` 命令。可以关闭自动签名/加密来测试签名错误，或构造缺失字段、余额不足、同号异参数等负向场景。
- **业务记录**：筛选业务表，查看单据原文，对订单、退款、分账、提现、进件和注销等执行对应的状态推进操作。
- **回调与日志**：检查通知密文、发送次数、目标 HTTP 状态，查看内置接收器解密结果，手动重发通知并查询请求日志。
- **环境与设置**：切换严格验签、自动支付和自动完成，设置回调地址与测试余额，注入故障，复制接入参数、导出状态或确认重置测试数据。

控制台每 5 秒刷新服务数据，可关闭自动刷新；刷新保留请求草稿。网页发起的官方接口请求通过同源 `POST /mock/console/request` 代理，服务端自动使用测试商户密钥签名并按文档加密敏感字段，严格模式也可直接操作。浏览器不会取得私钥。相同敏感字段的加密结果在测试状态中有界缓存，避免网页重发同一请求时产生不同密文而破坏幂等测试。

页面中的前置业务单号取自当前模拟状态，缺少前置数据的场景会提示先创建对应单据；修改 `notify_url` 可以把通知发送至你的业务服务。页面重置需要再次确认，完整交易链路不会清空现有记录。网页只在本地提供，随 `pnpm build` 一并复制到 `dist/web`，`pnpm start` 使用同一套操作页面。

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

默认状态与测试密钥保存在 `data/`，重启保留。服务使用单进程串行事务和原子 JSON 快照，失败请求回滚业务修改。不要用多个进程共享同一个数据目录。

```powershell
pnpm dev -- --memory
pnpm dev -- --port 3001 --data-dir data-other
Copy-Item mock.config.example.json mock.config.json
pnpm dev -- --config mock.config.json
```

只读取命令行指定的 JSON 配置，不读取环境变量或 `.env` 文件。开发模式文件监听重启会保留磁盘状态。`--memory` 每次重启清空状态和测试密钥。

## 一键联调

保持服务运行，在另一个终端执行：

```powershell
pnpm smoke
```

脚本执行下单 → 支付 → 100 分分账并解冻 → 200 分退款 → 200 分提现 → 下载 GZIP 账单并校验 SHA1，全程验证官方应答签名。每次使用新单号，不重置已有数据；业务通知发往内置 `/mock/receiver`。初始余额为零的二级商户完成后可用余额为 500 分。脚本也适用于 `autoComplete=false`。

默认测试参数：

| 参数                       | 值                                 |
| -------------------------- | ---------------------------------- |
| 平台商户号 / sp_mchid      | `1900000100`                       |
| 平台 AppID / sp_appid      | `wx_mock_platform`                 |
| 默认二级商户号 / sub_mchid | `1900000101`                       |
| APIv3 密钥                 | `0123456789abcdef0123456789abcdef` |
| 平台 BASIC 初始可用余额    | 100000000 分                       |
| 二级商户初始余额           | 0 分                               |

支付后，分账订单资金进入冻结余额；普通订单直接进入可用余额。平台补差使用 OPERATION 账户，需先通过测试控制接口设置余额。

## 接入业务系统

将业务系统或微信支付 SDK 的 API 基础地址替换为 `http://127.0.0.1:3000`，保留原 `/v3/...` 路径、参数和状态处理。通知地址可使用本机 HTTP 地址。JSAPI、APP、Native 的前端支付用控制接口模拟成功；H5 下单返回可直接打开的本地收银台。

PowerShell 示例：

```powershell
$base = 'http://127.0.0.1:3000'
$body = @{
  sp_appid = 'wx_mock_platform'
  sp_mchid = '1900000100'
  sub_mchid = '1900000101'
  description = '联调商品'
  out_trade_no = 'ORDER001'
  notify_url = "$base/mock/receiver"
  amount = @{ total = 1000; currency = 'CNY' }
  settle_info = @{ profit_sharing = $true }
} | ConvertTo-Json -Depth 10
Invoke-RestMethod "$base/v3/pay/partner/transactions/native" -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body))

# 模拟支付成功，重复执行不会重复入账
Invoke-RestMethod "$base/mock/actions/pay" -Method Post -ContentType 'application/json' -Body '{"sub_mchid":"1900000101","out_trade_no":"ORDER001"}'

# 取得 transaction_id，后续用于分账、补差等
Invoke-RestMethod "$base/v3/pay/partner/transactions/out-trade-no/ORDER001?sp_mchid=1900000100&sub_mchid=1900000101"
```

## 异步状态与失败场景

默认 `autoPay=false`：下单保持 NOTPAY，调用 `pay` 后成功。默认 `autoComplete=true`：进件、退款、分账、提现和出境受理后自动完成。设置 `autoComplete=false` 后通过动作推进，查询接口不自动推进状态。

```powershell
Invoke-RestMethod "$base/mock/config" -Method Patch -ContentType 'application/json' -Body '{"autoComplete":false}'
Invoke-RestMethod "$base/mock/actions/complete-refund" -Method Post -ContentType 'application/json' -Body '{"sub_mchid":"1900000101","out_refund_no":"REFUND001","status":"ABNORMAL"}'
```

控制动作统一使用 `POST /mock/actions/{action}`。正式申请必须先通过对应官方接口提交；`merchant` 可直接种子化多商户资料。

| action                   | 主要参数与状态                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pay`                    | `sub_mchid` + `out_trade_no`，或 `prepay_id`，或 `combine_out_trade_no`；可带 `payer`                                                                             |
| `complete-refund`        | `sub_mchid` + `refund_id` / `out_refund_no`，`status=SUCCESS/CLOSED/ABNORMAL`                                                                                     |
| `complete-profitsharing` | `sub_mchid` + `out_order_no`，`success=false` 模拟失败，支持 `fail_reason`                                                                                        |
| `complete-withdrawal`    | `withdraw_id`，或 `sub_mchid` + `out_request_no`；`status=SUCCESS/FAIL/REFUND/CLOSE`                                                                              |
| `complete-overseas`      | `sub_mchid` + `out_order_id`，`success=false` 模拟出境失败                                                                                                        |
| `applyment`              | `applyment_id` / `out_request_no`，`state=CHECKING/ACCOUNT_NEED_VERIFY/AUDITING/REJECTED/NEED_SIGN/FINISH/FROZEN/CANCELED`                                        |
| `settlement`             | `sub_mchid` + `application_no`，`state=AUDITING/AUDIT_SUCCESS/AUDIT_FAIL`                                                                                         |
| `cancel`                 | 旧注销 `out_apply_no`，`state=REVIEWING/REJECTED/CANCEL_SUCCESS`                                                                                                  |
| `cancel-withdraw`        | 新注销 `applyment_id` / `out_request_no`，`state` 可为确认、审核、资金处理及 FINISH 等状态                                                                        |
| `cancel-withdrawal`      | 旧注销后提现 `applyment_id` / `out_request_no`，`state=SUBMITTED/PASSED/PAY_SUCCEED/REJECTED/PAY_FAILED/BANK_REFUNDED`                                            |
| `subject-alter`          | `apply_id`，或 `merchant_code` + `out_request_no`，`state=APPLYMENT_STATE_AUDITING/APPLYMENT_STATE_REJECTED/APPLYMENT_STATE_FINISHED/APPLYMENT_STATE_CANCELED` 等 |
| `merchant`               | `sub_mchid`；可设主体资料、`merchant_state`、`block_reasons:[{type,description}]`，空数组清除预校验阻断                                                           |

终态及重复操作受状态机约束。退款处理中预占额度，失败释放资金；提现失败或退票恢复余额。资金变化只执行一次，同一业务单号异参数请求拒绝。进件返回的签约/账户验证链接和新注销确认链接可在浏览器打开，通过页面按钮完成本地确认。

## 测试管理接口

| 接口                                      | 用途                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /health`                             | 存活检查                                                                               |
| `GET /mock/apis`                          | 文档契约、实际注册覆盖和控制动作名称                                                   |
| `GET /mock/credentials`                   | 测试商户参数、平台公钥/证书、证书序列号与 APIv3 密钥；不提供私钥                       |
| `GET /mock/config` / `PATCH /mock/config` | 查看配置；热更新 strict、autoPay、autoComplete、serviceNotifyUrl                       |
| `GET /mock/state`                         | 业务单、账户、幂等记录、通知和最近 200 个请求日志                                      |
| `POST /mock/accounts`                     | 设定指定 `mchid`、`account_type` 的 `available` / `frozen`；金额单位分                 |
| `POST /mock/reset`                        | 清空全部测试业务状态，恢复默认种子商户和初始余额，保留测试密钥                         |
| `POST /mock/faults`                       | 注入指定 `method`、实际 `path` 的错误；支持 status、code、message、remaining、delay_ms |
| `GET /mock/notifications`                 | 查看加密通知、发送次数、重试状态和最近错误                                             |
| `POST /mock/notifications/{id}/retry`     | 重置重试次数，重发同一通知                                                             |
| `POST /mock/receiver`                     | 内置通知接收器，验证平台签名；原始头、密文和解密结果保存在状态中                       |

示例：让下一次 Native 下单返回 500，随后同号重试正常处理：

```powershell
Invoke-RestMethod "$base/mock/faults" -Method Post -ContentType 'application/json' -Body '{"method":"POST","path":"/v3/pay/partner/transactions/native","status":500,"code":"SYSTEM_ERROR","remaining":1}'
```

通知使用 AES-256-GCM 加密资源，使用平台 RSA 私钥签名。收到 HTTP 200/204 即成功，否则按配置重试；默认首次失败后依次等待 1、5、15、30、60 秒，最多发送 6 次。重试保持相同通知 ID 和密文，每次重新签名。队列持久化，重启恢复；回调协议允许重复投递，接收端应以通知 ID 或业务单号去重。

## 严格验签与 SDK

```powershell
pnpm keys:export
pnpm dev -- --strict
pnpm smoke -- --strict
```

`keys:export` 从 `data/keys.json` 导出同一套测试密钥，服务未运行时也可执行。SDK 使用 `data/merchant_private_key.pem`、`data/merchant_certificate.pem`，平台信任证书使用 `data/platform_certificate.pem`，APIv3 密钥使用配置值。`GET /mock/credentials` 可读取正确序列号。自定义数据目录时：`pnpm keys:export data-other`，同时让服务用同一目录。

严格模式验证 `WECHATPAY2-SHA256-RSA2048` 请求签名、原始 URI/查询串/JSON、商户号、证书序列号和 5 分钟时间窗口；上传以 multipart 中原始 meta JSON 签名。敏感字段用平台公钥进行 RSA-OAEP-SHA1 加密，并附 `Wechatpay-Serial`；响应敏感字段由测试商户私钥解密。文档的敏感字段长度按解密后的明文检查。

密码学规则参考微信支付官方[签名说明](https://pay.wechatpay.cn/doc/v3/merchant/4012365336)、[敏感字段加密](https://pay.wechatpay.cn/doc/v3/merchant/4013053257)和[敏感字段解密](https://pay.wechatpay.cn/doc/v3/merchant/4013053265)。证书是本地生成的自签名测试证书。

## 实现范围和模拟约定

- 进件、主体变更、结算账户、新旧注销、真实 multipart 上传和 SHA256 校验均保存可查询状态；媒体只保存元数据，不长期保存文件原文。
- 普通/合单支付、查询、关单、退款、异常退款和垫付回补支持真实业务状态、幂等及金额校验。客户端实际微信授权、拉起微信和银行付款均由模拟动作替代。
- 分账、多接收方、回退、剩余资金解冻、补差及回退；账户余额、普通/日终提现；跨境申请及查询均有资金关联。
- 账单由模拟业务状态生成，支持真实 CSV 下载、SHA1、GZIP。二级商户资金账单支持 AES-256-GCM 文件加密与 RSA-OAEP 密钥加密，下载链接有效 5 分钟；不支持 SM4-GCM，传入会明确报参数错误。
- 账单使用本地 CSV 字段和当前净业务状态，未复刻外链附录的所有生产字段或跨日修改历史。日终余额是该日期首次查询时保存的模拟快照，可通过账户控制构造场景。账单允许当天生成，方便即时联调。
- 跨境汇率固定 1:1，手续费为零；真实汇兑、风控、银行审核、微信账号和 AppID 绑定关系由本地规则模拟。
- 文档中“消费者投诉2.0”仅是外部文档跳转，本目录没有其 API 定义；外链服务及客户端 SDK 接口不计入 74 个服务端接口覆盖。

业务时间使用北京时间 RFC3339，签名时间戳使用 UTC Unix 秒。错误返回官方风格的 HTTP 状态与 `{code,message}`。具体生产风控、限频、优惠、手续费和到账时效不会被本地模拟服务复现。

本项目自动化测试覆盖文档路由注册、支付/退款/分账金额守恒、多商户隔离、审核和注销、真实上传、并发幂等、持久化、严格验签、证书解密及 HTTP 通知重试。更新本地文档后执行 `pnpm contracts:generate`，再运行测试核对覆盖。
