# FurniGuide AI 家具选购助手

## 技术需求文档（通俗版）

> 本文默认采用“方案 1”：把 FurniGuide 作为 AiDome 的一个软装选购子模块，而不是再做一个完全独立的产品。这样可以复用 AiDome 中的户型、房间照片、设计方案和账号体系，最后形成一条完整链路：
>
> **户型布局 → 家具推荐 → 尺寸校验 → 实景预览 → 购买清单 → 数据复盘**

---

## 1. 我们要做什么

用户进入 FurniGuide 后，先告诉系统“这是什么房间、房间有多大、家里有哪些人、预算多少、喜欢什么风格”。系统再根据这些信息推荐家具。

系统不只展示家具图片，还要回答三个关键问题：

1. 这件家具能不能放进房间？
2. 这件家具能不能通过门、过道和电梯？
3. 买回来放在我家，实际大概是什么效果？

第一版不做实时 AR，也不做复杂 3D。先用 Mock 商品数据、规则校验和 2D AI 图片合成把完整交互跑通。

---

## 2. 总体技术选型

### 2.1 前端

| 技术 | 用途 | 为什么选它 |
|---|---|---|
| Next.js 15+ App Router | 页面、路由、服务端接口 | 前后端可以放在一个项目里，适合快速做 Demo |
| TypeScript | 类型约束 | 防止房间、商品、预览任务的数据字段写错 |
| Tailwind CSS | 页面布局和响应式样式 | 改样式快，方便适配电脑、平板和手机 |
| shadcn/ui | Button、Dialog、Card、Form 等基础组件 | 组件可控、容易和 AiDome 统一视觉 |
| React Hook Form + Zod | 分步表单和校验 | 适合处理房间尺寸、预算等复杂表单 |
| Recharts | 指标看板图表 | 足够支撑推荐点击率、生成成功率等图表 |

### 2.2 后端和数据

| 技术 | 用途 |
|---|---|
| Next.js Route Handlers / Server Actions | 提供业务接口和服务端操作 |
| PostgreSQL（推荐 Supabase） | 保存用户、房间、家具、推荐和预览记录 |
| Prisma | 数据库访问和迁移，保证 TypeScript 类型安全 |
| Supabase Storage | 保存房间照片和 AI 生成图片 |
| Zod | 统一校验前端输入和 API 输入 |

如果 AiDome 已经有数据库，优先复用现有 Postgres 和用户表；如果没有，FurniGuide 可以先单独使用一个 Supabase 项目。

### 2.3 AI 和外部服务

- **商品推荐：** 第一版使用规则 + Mock 商品数据，后续再接大模型。
- **尺寸校验：** 使用确定性的规则引擎，不交给大模型判断。
- **图像生成：** 封装 `ImageGenerationProvider`，开发阶段使用 Mock Provider，生产阶段接 Flux 或 DALL·E。
- **AI 导购：** 封装 `ChatProvider`，第一版可接 OpenAI 兼容接口，并把房间档案和当前选中家具作为上下文。
- **埋点：** 第一版写入自己的 `analytics_events` 表；后续可同步 PostHog、Amplitude 等平台。

### 2.4 部署

- Web 和 API：Vercel
- 数据库：Supabase Postgres
- 图片：Supabase Storage 或 Cloudflare R2
- 环境变量：Vercel Environment Variables
- CI：GitHub Actions 执行 lint、typecheck、test、build

---

## 3. 系统怎么分层

整体采用一个 Next.js 全栈项目，但代码分层要清楚：

```text
浏览器
  ↓
页面层（App Router、React 组件）
  ↓
业务层（推荐、尺寸校验、预算、预览任务、聊天）
  ↓
数据访问层（Prisma Repository）
  ↓
PostgreSQL / Storage / AI 服务
```

### 3.1 页面层

负责展示页面和收集用户操作，不直接写复杂业务规则。例如商品卡片只负责显示“可放置/有风险”，真正的判断放在尺寸校验服务里。

### 3.2 业务层

这里是项目最重要的部分：

- `recommendationService`：根据房间条件生成候选家具。
- `dimensionCheckService`：判断能否放下、能否入户、是否遮挡固定设施。
- `previewService`：创建预览任务、调用图片模型、保存结果。
- `budgetService`：计算总预算和剩余预算。
- `chatService`：组装 AI 对话上下文并执行家具替换等操作。
- `analyticsService`：记录推荐查看、收藏、生成预览等行为。

### 3.3 数据访问层

页面和业务层不直接写 SQL，统一通过 Repository 访问数据库。这样以后把 Supabase 换成别的 Postgres，或者接入 AiDome 现有数据时，改动会小很多。

### 3.4 Provider 适配层

外部服务全部通过接口接入：

```ts
interface ImageGenerationProvider {
  generate(input: PreviewGenerationInput): Promise<GenerationResult>
}

interface ChatProvider {
  reply(input: ChatContext): Promise<ChatReply>
}
```

本地开发使用 Mock 实现，线上再切换 Flux、DALL·E 或其他模型，不让模型 SDK 代码散落在页面里。

---

## 4. 推荐的项目目录结构

```text
furniguide/
├─ app/
│  ├─ (marketing)/                  # 首页、产品介绍
│  ├─ (workspace)/                  # 登录后的工作区布局
│  │  ├─ layout.tsx
│  │  ├─ onboarding/page.tsx        # 房间信息收集
│  │  ├─ recommendations/page.tsx   # AI 推荐清单
│  │  ├─ previews/page.tsx          # 实景预览
│  │  ├─ shopping-list/page.tsx     # 收藏和购买清单
│  │  └─ analytics/page.tsx         # 指标与方案复盘
│  ├─ api/
│  │  ├─ rooms/route.ts
│  │  ├─ recommendations/route.ts
│  │  ├─ dimension-check/route.ts
│  │  ├─ previews/route.ts
│  │  ├─ previews/[id]/route.ts
│  │  ├─ chat/route.ts
│  │  ├─ shopping-list/route.ts
│  │  └─ analytics/route.ts
│  ├─ layout.tsx
│  ├─ page.tsx
│  └─ globals.css
├─ components/
│  ├─ ui/                           # shadcn/ui 组件
│  ├─ onboarding/                   # 分步表单组件
│  ├─ furniture/                    # 家具卡片、筛选器、对比栏
│  ├─ preview/                      # Before/After、生成状态、瑕疵标注
│  ├─ chat/                         # 对话侧边栏和快捷问题
│  └─ analytics/                    # KPI 卡片和图表
├─ lib/
│  ├─ db.ts                         # Prisma Client 单例
│  ├─ auth.ts                       # 用户身份获取
│  ├─ storage.ts                    # 图片上传和签名 URL
│  ├─ validations/                  # Zod Schema
│  ├─ repositories/                 # 数据库访问
│  ├─ services/                     # 业务逻辑
│  ├─ providers/                    # AI、图片、Mock 适配器
│  └─ analytics/                    # 埋点事件定义
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts                       # Mock 家具和演示数据
├─ public/
│  └─ demo/                         # 不敏感的演示图片
├─ tests/
│  ├─ unit/                         # 尺寸校验、预算计算
│  └─ e2e/                          # Playwright 主链路
├─ .env.example
├─ middleware.ts
├─ package.json
└─ README.md
```

目录规则：组件负责显示，`services` 负责业务，`repositories` 负责数据库，`providers` 负责外部服务。不要在页面组件中直接调用 Prisma 或 AI SDK。

---

## 5. 路由设计

### 5.1 页面路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 产品首页 | 介绍 FurniGuide，进入工作区 |
| `/onboarding` | 房间信息收集 | 上传照片、填写尺寸、选择预算和风格 |
| `/recommendations` | 推荐清单 | 查看、筛选、收藏家具 |
| `/previews` | 实景预览 | 选择家具并生成 Before/After |
| `/shopping-list` | 购买清单 | 查看收藏、预算和尺寸风险 |
| `/analytics` | 指标面板 | 产品侧查看推荐和生成效果 |
| `/settings` | 设置 | 账号、单位、语言和数据删除 |

### 5.2 API 路由

| 方法 | 路由 | 作用 |
|---|---|---|
| `POST` | `/api/rooms` | 创建或更新房间档案 |
| `GET` | `/api/rooms/:id` | 获取房间档案 |
| `POST` | `/api/recommendations` | 生成推荐结果 |
| `POST` | `/api/dimension-check` | 对家具执行尺寸校验 |
| `POST` | `/api/previews` | 创建预览任务 |
| `GET` | `/api/previews/:id` | 查询预览状态和图片 |
| `POST` | `/api/chat` | 发送导购问题 |
| `POST` | `/api/shopping-list` | 加入、移除或更新购买清单 |
| `POST` | `/api/analytics/events` | 写入行为埋点 |
| `GET` | `/api/analytics/summary` | 获取指标面板数据 |

API 统一返回格式：

```json
{
  "success": true,
  "data": {},
  "error": null,
  "requestId": "req_xxx"
}
```

报错时不返回堆栈信息，只返回用户可理解的错误；详细错误写入服务端日志。

---

## 6. 数据库 Schema

下面是适合 MVP 的核心表。实际接入 AiDome 时，`users`、`rooms` 和 `room_assets` 可以映射或复用 AiDome 的同名数据。

### 6.1 用户和房间

```text
users
- id              uuid PK
- email           varchar unique
- name            varchar nullable
- created_at      timestamp

rooms
- id              uuid PK
- user_id         uuid FK users.id
- source          enum('manual', 'aidome')
- aidome_plan_id  varchar nullable
- room_type       enum('living_room', 'bedroom', 'dining_room', 'study', 'other')
- length_cm       integer nullable
- width_cm        integer nullable
- height_cm       integer nullable
- door_width_cm   integer nullable
- hallway_width_cm integer nullable
- lighting        enum('bright', 'normal', 'dark') nullable
- budget_min      integer nullable
- budget_max      integer nullable
- style           varchar[]
- members         jsonb
- constraints     jsonb
- created_at      timestamp
- updated_at      timestamp
```

`constraints` 保存门、窗、插座、承重墙等不规则信息；`members` 保存儿童、宠物等家庭情况，方便后续扩展。

### 6.2 图片和家具

```text
room_assets
- id              uuid PK
- room_id         uuid FK rooms.id
- type            enum('room_photo', 'floor_plan', 'generated_preview')
- storage_key     varchar
- url             varchar nullable
- metadata        jsonb
- created_at      timestamp

furniture_products
- id              uuid PK
- name            varchar
- category        varchar
- price_min       integer
- price_max       integer
- width_cm        integer
- depth_cm        integer
- height_cm       integer
- entrance_width_cm integer nullable
- material        varchar[]
- style           varchar[]
- image_url       varchar
- pros            text[]
- cons            text[]
- metadata        jsonb
- is_active       boolean
- created_at      timestamp
```

### 6.3 推荐和清单

```text
recommendation_sessions
- id              uuid PK
- room_id         uuid FK rooms.id
- input_snapshot  jsonb
- created_at      timestamp

recommendations
- id              uuid PK
- session_id      uuid FK recommendation_sessions.id
- product_id      uuid FK furniture_products.id
- score           decimal
- reason          text
- dimension_status enum('pass', 'warning', 'fail', 'unknown')
- dimension_details jsonb
- created_at      timestamp

shopping_list_items
- id              uuid PK
- user_id         uuid FK users.id
- room_id         uuid FK rooms.id
- product_id      uuid FK furniture_products.id
- item_type       enum('favorite', 'selected')
- quantity        integer default 1
- created_at      timestamp
```

### 6.4 预览、对话和埋点

```text
preview_jobs
- id              uuid PK
- room_id         uuid FK rooms.id
- user_id         uuid FK users.id
- product_ids     uuid[]
- provider        varchar
- status          enum('queued', 'processing', 'succeeded', 'failed')
- prompt_snapshot jsonb
- result_asset_id uuid nullable
- quality_metrics jsonb nullable
- error_code      varchar nullable
- created_at      timestamp
- completed_at    timestamp nullable

chat_sessions
- id              uuid PK
- user_id         uuid FK users.id
- room_id         uuid FK rooms.id
- created_at      timestamp

chat_messages
- id              uuid PK
- session_id      uuid FK chat_sessions.id
- role            enum('user', 'assistant', 'tool')
- content         text
- tool_action     jsonb nullable
- created_at      timestamp

analytics_events
- id              bigint PK
- user_id         uuid nullable
- room_id         uuid nullable
- event_name      varchar
- properties      jsonb
- created_at      timestamp
```

### 6.5 重要索引

- `rooms.user_id`
- `recommendations.session_id`
- `recommendations.product_id`
- `preview_jobs.user_id, created_at`
- `analytics_events.event_name, created_at`

---

## 7. 核心业务流程怎么实现

### 7.1 房间信息收集

1. 用户上传房间照片，前端先压缩图片。
2. 图片上传到 Storage，数据库只保存 `storage_key`。
3. 用户填写尺寸、预算、风格和家庭成员。
4. Zod 在浏览器校验一次，API 服务端再校验一次。
5. 保存成 `rooms` 记录，并返回房间 ID。

### 7.2 推荐和尺寸校验

1. 根据房间类型、预算和风格筛选商品。
2. 对每件商品调用尺寸校验服务。
3. 计算放置空间、通行空间和入户空间。
4. 组合推荐结果，保存 `recommendation_sessions` 和 `recommendations`。
5. 前端按照通过、需确认、不可放置展示颜色和文字状态。

尺寸校验应该是可解释的，例如：

```text
房间可用宽度 320cm
沙发宽度 280cm
两侧最小通行空间要求 20cm × 2
结论：通过，剩余空间 20cm
```

### 7.3 实景预览

1. 用户选择房间图片和一件或多件家具。
2. API 创建 `preview_jobs`，状态为 `queued`。
3. 服务端拼装房间描述、家具信息和摆放要求。
4. 调用 Mock、Flux 或 DALL·E Provider。
5. 图片保存到 Storage，更新任务状态为 `succeeded`。
6. 前端每 2～3 秒查询一次任务状态，完成后展示结果。

如果后续生成时间较长，再把任务放入 Inngest、Trigger.dev 或队列服务；MVP 不需要先引入复杂基础设施。

### 7.4 AI 对话

每次提问都组装以下上下文：

- 当前房间尺寸和限制。
- 当前预算和风格。
- 已选家具及尺寸。
- 最近的推荐结果。
- 用户刚刚的问题。

AI 不能直接修改数据库。它先返回结构化动作，例如：

```json
{
  "answer": "这款沙发无法通过 80cm 门洞，建议换成宽度小于 75cm 的款式。",
  "action": {
    "type": "replace_product",
    "productId": "xxx"
  }
}
```

服务端验证动作后，才真正更新清单或重新生成推荐。

---

## 8. 响应式和体验规范

### 桌面端

- 推荐页采用“筛选区 + 商品区 + 预算/聊天区”。
- 预览页展示大图和 Before/After 滑块。

### 平板端

- 筛选区和聊天区改为抽屉。
- 商品卡片使用两列布局。

### 手机端

- 所有页面单列展示。
- 聊天助手改为底部抽屉。
- 商品卡片横向滑动。
- 分步表单每次只展示一组问题。

### 状态必须完整

每个异步功能都要有：加载中、成功、失败、空数据、重试五种状态。尤其是图片生成，不能让用户面对一个空白区域。

---

## 9. 实现步骤

### 第 1 阶段：项目骨架（1～2 天）

1. 初始化 Next.js、TypeScript、Tailwind、shadcn/ui。
2. 建立工作区布局、导航和响应式断点。
3. 配置 ESLint、Prettier、环境变量和 Git Hooks。
4. 建立 Prisma Schema 和 Supabase 数据库。

### 第 2 阶段：房间档案（2～3 天）

1. 完成分步 onboarding 表单。
2. 完成图片上传和压缩。
3. 完成房间档案保存、草稿恢复和 AiDome 导入 Mock。
4. 写房间数据的单元测试。

### 第 3 阶段：推荐和尺寸校验（3～4 天）

1. 建立 Mock 商品种子数据。
2. 完成商品卡片、筛选器和排序。
3. 实现尺寸、通道、门洞和固定设施校验。
4. 完成收藏、对比和购买清单。

### 第 4 阶段：实景预览（3～4 天）

1. 建立图片 Provider 接口和 Mock Provider。
2. 完成预览任务状态机。
3. 完成 Before/After、历史记录、失败重试。
4. 预留 Flux/DALL·E 的真实接口配置。

### 第 5 阶段：AI 导购和指标面板（2～3 天）

1. 完成聊天侧边栏和快捷问题。
2. 支持替换商品、降低预算、重新生成预览。
3. 接入行为埋点。
4. 完成用户侧预算/风险汇总和平台侧 KPI 图表。

### 第 6 阶段：联调和上线（2～3 天）

1. 用 Playwright 跑通主链路。
2. 检查手机、平板和桌面端布局。
3. 检查错误状态、权限和图片隐私。
4. 接入真实 AI Provider。
5. 部署到 Vercel，配置域名和环境变量。

---

## 10. 测试要求

### 单元测试

- 房间尺寸校验。
- 入户尺寸校验。
- 家具组合冲突校验。
- 预算合计和预算超限。
- 推荐结果排序。

### 接口测试

- 未登录不能读取其他用户房间。
- 图片上传类型和大小校验。
- 预览任务状态转换正确。
- AI 返回非法动作时不能直接修改数据。

### E2E 测试

至少覆盖以下完整流程：

```text
填写房间信息
→ 生成推荐
→ 查看尺寸风险
→ 收藏商品
→ 创建实景预览
→ 发送导购问题
→ 替换家具
→ 查看预算和方案总结
```

---

## 11. 部署和环境变量

### 环境变量示例

```bash
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
AI_PROVIDER="mock"
OPENAI_API_KEY="..."
IMAGE_PROVIDER="mock"
IMAGE_GENERATION_API_KEY="..."
NEXT_PUBLIC_APP_URL="https://furniguide.example.com"
```

密钥只放在服务端环境变量，不能写在 `NEXT_PUBLIC_` 变量中。

### 发布流程

1. 提交代码到 GitHub。
2. GitHub Actions 执行 lint、类型检查、单元测试和构建。
3. 合并到 `main` 后，Vercel 自动部署。
4. 线上执行 Prisma migration。
5. 检查健康接口和关键页面。

### 回滚策略

- Vercel 保留上一个可用版本，可以一键回滚。
- 数据库迁移只做向前兼容，避免直接删除旧字段。
- 图片和预览记录保留，不因前端回滚而丢失。

---

## 12. 安全、隐私和成本控制

- 所有房间和预览数据必须绑定 `user_id`。
- Storage 图片使用私有桶和短期签名 URL。
- 限制单张图片大小和每日 AI 生成次数。
- 对聊天输入和图片生成提示词做长度限制。
- 记录 AI 请求耗时、失败原因和估算成本。
- Demo 阶段默认使用 Mock Provider，避免开发时产生大量模型费用。

---

## 13. 第一版完成的判断标准

当用户可以在一个浏览器会话里完成以下事情，就说明 MVP 通过：

1. 上传房间照片并填写房间尺寸。
2. 选择预算、风格和目标家具。
3. 得到至少 6～10 件 Mock 家具推荐。
4. 看懂每件家具为什么“可放置/需确认/不可放置”。
5. 收藏家具并看到实时预算。
6. 生成一张家具摆放后的实景预览图。
7. 询问 AI 并完成一次家具替换。
8. 在方案复盘页看到预算、风险和关键行为数据。

这样做出来的不是几个孤立页面，而是一套可以现场演示、可以解释技术实现、也方便后续接入真实 AI 和电商数据的软装产品闭环。
