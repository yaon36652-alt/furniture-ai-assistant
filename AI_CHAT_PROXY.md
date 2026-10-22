# AI 导购代理接口

## 为什么会提示“无法连接导购服务”

前端通过相对路径 `POST /api/chat` 请求当前网页所在的 Node 服务。如果 `server.js` 没有启动，浏览器会直接出现 `Failed to fetch`，前端就会显示“暂时无法连接导购服务”。即使服务已启动，如果没有设置 `OPENAI_API_KEY`，代理也会返回 `503 missing_api_key`，前端会显示明确的配置提示。

## 配置并启动

需要 Node.js 22 或以上。前后端由同一个 Node 服务提供，无需另启静态文件服务器。

1. 复制 `.env.example` 为项目根目录的 `.env.local`。模型 API Key 可以由系统环境变量覆盖；`OPENAI_BASE_URL` 则优先读取 `.env.local`，其次读取系统环境变量，最后回退到 `.env`。
2. 在 `.env.local` 填入服务端密钥：

```env
OPENAI_API_KEY=你的服务端密钥
OPENAI_BASE_URL=https://codex.api.qiandd.xyz/v1
OPENAI_MODEL=gpt-4o-mini
```

3. 在项目目录运行：

```bash
npm run dev
```

4. 用浏览器打开 `http://localhost:4173/`。修改 `.env.local` 后必须重启 Node 服务。

如果端口已占用，可在 PowerShell 使用 `$env:PORT='4174'`，再运行 `npm run dev` 并打开 `http://localhost:4174/`。

不要把密钥写到前端代码、`NEXT_PUBLIC_*` 变量或提交到 Git。服务端只返回模型回答，不返回 API Key。

## 接口

### `GET /api/health`

返回服务是否启动，以及是否检测到服务端密钥：

```json
{
  "ok": true,
  "modelConfigured": true,
  "model": "gpt-4o-mini"
}
```

### `POST /api/chat`

请求体：

```json
{
  "message": "这个书桌能放进卧室吗？",
  "context": {
    "roomName": "卧室",
    "dimensions": { "length": 360, "width": 270, "doorWidth": 82, "height": 275 },
    "household": 3,
    "budget": { "limit": 12000, "spent": 5498, "remaining": 6502 },
    "shopping": [
      { "id": "desk", "name": "静音书桌", "price": 1499, "category": "书桌", "size": "120 × 60 × 75 cm" }
    ]
  }
}
```

后端会对 Context 做字段白名单、长度和数值范围校验，再注入 System Prompt，并明确要求模型把上下文视为数据。这样可降低提示词注入风险，但不能保证模型始终遵循要求。尺寸单位为 cm，预算单位为人民币元。成功响应：

```json
{ "answer": "...", "mode": "model", "model": "gpt-4o-mini" }
```

常见错误：

- `503 missing_api_key`：没有配置 `.env.local` 或没有重启服务。
- `502 model_auth_failed`：密钥无效或没有调用权限。
- `502 model_rate_limited`：额度不足或请求频率受限。
- `502 model_not_found`：`OPENAI_MODEL` 不是当前 Base URL 支持的模型名称。
- `502 model_endpoint_not_found`：Base URL 路径不对，或服务不支持 OpenAI Chat Completions 兼容接口。
- `502 model_dns_error`：无法解析 Base URL 的域名，检查 DNS、代理和拼写。
- `502 model_network_error`：TCP/TLS 连接被拒绝或网络出口被拦截；服务端日志会记录底层错误码（例如 `EACCES`、`ECONNRESET`）。
- `502 model_invalid_response` / `model_empty_response`：上游返回格式不是 Chat Completions，或没有返回 `choices[0].message.content`。
- `504 model_timeout`：请求超过 60 秒未返回。

## 本地排查

1. 先确认服务端配置被加载：打开 `http://localhost:4173/api/health`，检查 `modelConfigured`、`model` 和实际端口。`modelConfigured: true` 只代表读取到了 Key，不代表 Key、模型或网络可用。
2. 在项目目录重启服务：`npm run dev`。每次修改 `.env.local` 后都必须重启；如果 `4173` 被占用，可用 `$env:PORT='4174'; npm run dev`。
3. 在另一个 PowerShell 终端直接发最小请求：

```powershell
$body = @{ message = '请用一句话确认模型接口连接正常。'; context = @{} } | ConvertTo-Json
Invoke-RestMethod http://localhost:4173/api/chat -Method Post -ContentType 'application/json' -Body $body
```

4. 同时观察运行 `npm run dev` 的终端。每次失败都会打印 `[chat] status=... code=... provider=... model=... elapsed_ms=...`；不会打印 API Key。根据 `code` 对照上面的错误表检查 Base URL、模型名、网络代理、额度或权限。
5. 当前前端错误消息会显示后端返回的具体分类，且错误态不会再渲染默认/历史推荐商品卡。只有成功收到模型回答时才会显示推荐卡。

## 请求链路

浏览器聊天组件 → `POST /api/chat` → Node.js 读取 `.env.local` → OpenAI 兼容 `POST /chat/completions` → Node.js 返回 `answer` → 页面渲染回答。

当前实现使用 Node.js 原生 `http` 和 `fetch`，无需额外 npm 依赖；`OPENAI_BASE_URL` 指向 OpenAI 兼容 Chat Completions 协议的服务，`.env.local` 中的地址优先于系统环境变量。

静态服务仅公开 HTML、CSS 和前端 JavaScript，不允许下载 `.env`、后端源码或测试文件。通过 `npm test` 可验证代理转发、Context 注入、非法请求和服务端配置文件保护。测试使用本地模拟模型，不消耗真实 API 额度。`modelConfigured: true` 只表示检测到了 Key，不表示 Key 或账户额度一定有效。
