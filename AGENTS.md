# Repository Guidelines

## 项目结构与模块组织

本项目使用 Node.js 24、Hono 和 TypeScript，提供微信支付平台收付通模拟服务及本地控制台。

- `src/index.ts`：命令行启动；`src/app.ts`：应用组装及路由注册。
- `src/payments.ts`、`settlement.ts`、`merchants.ts`：支付、资金结算、商户业务；`core.ts`、`store.ts`、`crypto.ts`、`validation.ts`：运行时、持久化、密码学与参数校验。
- `src/web/`：控制台 HTML、CSS 和 JavaScript；`tests/`：业务及网页回归测试；`scripts/`：契约生成、密钥导出与冒烟验证。
- `平台收付通-电商交易解决方案/`：官方参考文档；保留原文及校验值。`src/contracts.ts` 和 `docs/api-coverage.md` 由脚本生成，不手工修改。

## 构建、测试与开发命令

在仓库根目录使用 PowerShell 和 pnpm：

| 命令 | 用途 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 监听源码，启动 `http://127.0.0.1:18397` |
| `pnpm dev -- --memory` | 使用内存状态，重启清空数据 |
| `pnpm build` / `pnpm start` | 编译并复制网页到 `dist/`；运行构建产物 |
| `pnpm typecheck` | 检查源码、测试与脚本的 TypeScript 类型 |
| `pnpm test` | 运行全部 `tests/*.test.*` |
| `pnpm format:check` / `pnpm format` | 检查格式；自动格式化 |
| `pnpm contracts:generate` | 从本地文档重新生成契约及覆盖表 |
| `pnpm smoke` | 在服务运行时验证支付、分账、退款、提现与账单链路 |

## 编码风格与命名

遵循 Prettier：两空格缩进、单引号、无分号、LF 换行。TypeScript 启用严格模式；使用 ESM，源码相对导入保留 `.js` 扩展名，类型导入使用 `import type`。变量及函数使用 `camelCase`，类型及类使用 `PascalCase`；官方接口字段保留 `snake_case`。沿用业务模块边界，避免无关重构。

## 测试指南

使用 `node:test` 和 `node:assert/strict`，经 tsx 执行。文件命名为 `tests/<领域>.test.ts`，网页测试可用 `.test.js`；测试名称描述可观察行为。新增或修复业务逻辑时覆盖正常路径、参数错误、状态转换、幂等与资金守恒。应用测试使用独立实例或临时数据目录，结束后调用 `close()`。当前未配置覆盖率阈值。提交前运行类型检查、测试、构建及格式检查；控制台改动补充浏览器检查。

## 提交与 Pull Request

历史提交包含 `feat: 添加平台收付通模拟服务与本地联调控制台`。建议沿用 `类型: 中文摘要`，例如 `fix: 修复重复退款扣款`，每次提交聚焦一个改动。PR 说明问题、行为变化及验证结果，关联相关 issue；控制台界面改动附截图。接口变化同步契约、覆盖表、测试和必要的 README 说明。

## 配置与代理约束

始终使用简体中文、UTF-8 和 PowerShell；需求不明确时先向用户提问。禁止读取环境变量及 `.env`、`.env.local` 等文件，`.env.example` 除外。配置使用命令行参数或显式 JSON 文件，例如 `pnpm dev -- --config mock.config.json`。`data/` 保存模拟状态和测试密钥，不提交该目录、`dist/` 或真实凭据；多个进程不得共享同一数据目录。
