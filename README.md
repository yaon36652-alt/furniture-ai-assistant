# FurniGuide 家具选购助手

FurniGuide 是一个中文家具选购与空间规划演示应用。它把房间尺寸、家具目录和预算清单放在同一个工作区，帮助用户在选购前查看家具信息、初步核对尺寸与入户条件，并整理不同房间的搭配方案。

## 项目要解决的问题

家具选购时，商品价格、尺寸、材质和入户条件往往分散在不同页面；只凭图片和价格，很难快速判断家具是否适合当前房间。FurniGuide 将这些信息集中到本地家具目录，并提供按房间查看候选、初步尺寸/门洞风险提示、预算汇总和摆放示意，方便用户在购买前比较方案。

这里的尺寸提示是基于已录入数据的初步校验，不是现场测量或配送承诺；下单前仍应向商家核实商品及包装尺寸、电梯和转角条件。

## 主要功能

- 按客厅、卧室、书房和餐厅切换空间，分别记录房间长宽、门洞宽度、层高和家庭人数。
- 从根目录 `furniture_db.json` 读取家具目录，展示商品图片、价格、尺寸、材质、风格和特性；按房间及品类浏览，并切换匹配度/价格排序。
- 根据家具尺寸和门洞记录显示初步空间或入户风险提示。
- 将家具加入当前房间的购买清单，汇总家具小计和 12,000 元演示预算的剩余金额；可收藏商品。
- 创建 2D 家具摆放示意：可上传房间背景图、选择家具、拖动位置、调整比例，并查看合成示意或 Before / After 分割效果。
- 通过 `/api/chat` 将当前房间、预算、推荐和清单上下文发送到 OpenAI 兼容的 Chat Completions 服务，获取家具选购建议。
- 房间信息、各房间清单、收藏和预览组合保存在浏览器 `localStorage` 中。上传的照片只在本机浏览器预览，刷新后需要重新选择。

## 技术栈与要求

- Node.js 22 或更高版本
- npm
- Next.js 15、React 19

## 安装与启动

```bash
git clone https://github.com/yaon36652-alt/furniture-ai-assistant.git
cd furniture-ai-assistant
npm ci
```

启动开发服务器：

```bash
npm run dev
```

在浏览器打开 <http://localhost:4173>。若端口被占用，可通过 `PORT` 指定其他端口，例如：

```powershell
$env:PORT = '4174'
npm run dev
```

```bash
PORT=4174 npm run dev
```

要在本地使用 AI 导购，可在项目根目录创建 `.env.local`，并填写服务端模型配置：

```env
OPENAI_API_KEY=你的服务端API密钥
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_BASE_URL` 必须指向兼容 OpenAI Chat Completions 接口的服务；模型名应由该服务支持。项目附带的 `.env.example` 使用预设的兼容服务地址，可按需调整。Next.js 和本地服务会读取 `process.env` 中的运行时变量；`.env.local` 仅用于本地开发，缺少该文件不会影响部署。Vercel 部署时，请在项目的 Environment Variables 中设置 `OPENAI_API_KEY`（以及需要时的 `OPENAI_BASE_URL`、`OPENAI_MODEL`），无需上传 `.env.local`。项目目前没有使用 Supabase 客户端；若后续启用，既定变量名为 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`，应从服务端运行时环境读取。修改本地配置后重启开发服务器。没有配置有效 API Key 时，页面和家具清单仍可浏览，但 AI 对话请求无法成功。不要把密钥写入前端代码或 `NEXT_PUBLIC_*` 环境变量，也不要提交 `.env.local`。

## 使用方法

1. 在顶部切换客厅、卧室、书房或餐厅；进入“房间信息”填写尺寸和家庭人数后保存。
2. 在“AI 推荐”查看该空间的本地家具候选，按品类筛选或按匹配度/价格排序；打开商品查看尺寸、材质及门洞信息。
3. 收藏商品，或将商品加入购买清单，查看预算汇总。
4. 将候选家具加入预览组合，在“实景预览”中上传背景、拖动家具或调整比例。此处是本地 2D 示意，并非照片级 AI 合成。
5. 配置服务端环境变量（本地可使用 `.env.local`）并重启服务或重新部署后，可打开“AI 导购”，询问当前空间的家具、尺寸、预算、材质或入户问题。

## 输入与输出示例

AI 导购输入示例（`POST /api/chat`）：

```json
{
  "message": "这张书桌适合放进书房吗？",
  "context": {
    "roomType": "study",
    "roomName": "书房",
    "dimensions": {
      "length": 320,
      "width": 240,
      "doorWidth": 82,
      "height": 275
    },
    "household": 3,
    "budget": {
      "limit": 12000,
      "spent": 1499,
      "remaining": 10501
    },
    "shopping": [
      {
        "id": "desk-001",
        "name": "静音原木书桌",
        "category": "书桌",
        "price": 1499,
        "size": "120 × 60 × 75 cm"
      }
    ]
  }
}
```

成功时，接口返回模型回答和实际使用模式；回答内容会因模型、目录数据和问题而变化：

```json
{
  "answer": "目录中的书桌约为 120 × 60 × 75 cm，书房记录为 320 × 240 cm，单件尺寸初步可放；还要为椅子和通道留出空间。",
  "mode": "model",
  "model": "gpt-4o-mini"
}
```

本地健康检查示例：`GET /api/health`。其中 `modelConfigured` 只表示服务端读到了 API Key，不代表上游密钥或模型调用一定可用。

```json
{
  "ok": true,
  "modelConfigured": true,
  "model": "gpt-4o-mini",
  "furnitureCatalogCount": 20
}
```

## 开发命令

```bash
npm run dev    # 启动开发服务器
npm run build  # 构建生产版本
npm start      # 启动生产服务器（先运行 npm run build）
npm test       # 运行 Node.js 内置测试
```

## 当前范围说明

- 家具候选和商品属性来自仓库内的示例目录，不连接实时库存、商家或第三方电商。
- “更新摆放预览”接口会确认 2D 示意组合，不会生成或修改真实照片；房间背景仅供浏览器本地预览。
- “一键结算”没有连接支付或下单服务；“方案复盘”中的指标是静态演示内容。
- 推荐排序及尺寸提示基于当前前端逻辑和目录字段，不等同于专业室内设计、精确测量或配送可达性保证。

## 许可证

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
