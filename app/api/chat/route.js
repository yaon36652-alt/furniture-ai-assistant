import { cleanChatContext, modelChat } from '../../../server.js';

export const runtime = 'nodejs';

const messages = {
  missing_api_key: '尚未配置大模型 API Key。请在项目根目录的 .env.local 中设置 OPENAI_API_KEY，然后重启服务。',
  model_auth_failed: '大模型 API Key 无效或没有调用权限，请检查密钥和账户权限。',
  model_rate_limited: '大模型服务当前请求过多或额度不足，请稍后重试并检查账户额度。',
  model_not_found: '上游服务找不到配置的模型。请核对 OPENAI_MODEL 是否是该服务支持的模型名称。',
  model_endpoint_not_found: '上游 API 路径不存在。请检查 OPENAI_BASE_URL 是否应包含 /v1，并确认服务支持 /chat/completions。',
  model_dns_error: '无法解析大模型服务域名。请检查 OPENAI_BASE_URL、DNS 和网络代理配置。',
  model_network_error: '无法连接大模型服务。请检查网络出口、防火墙和代理配置。',
  model_timeout: '大模型响应超过 60 秒仍未返回，请稍后重试并检查上游服务状态。',
  model_invalid_response: '大模型服务返回了无法解析的响应。请检查 API Base URL 和服务兼容性。',
  model_empty_response: '大模型服务已响应，但没有返回文本内容。请检查模型兼容性和服务端日志。',
  message_required: '请输入问题后再发送。',
  message_too_long: '问题过长，请缩短后重试。',
  invalid_json: '请求内容必须是有效的 JSON 对象。',
  payload_too_large: '请求内容过大，请减少家具清单或问题长度。'
};

function errorPayload(error) {
  const code = Object.hasOwn(messages, error.message) ? error.message : 'chat_unavailable';
  const status = error.statusCode || (code === 'message_required' ? 400 : code === 'message_too_long' ? 413 : 502);
  const upstreamCode = error.cause?.cause?.code || error.cause?.code;
  const detail = error.providerDetail || error.cause?.cause?.message || error.cause?.message || error.message;
  const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  let providerHost = 'unknown';
  try { providerHost = new URL(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').host; } catch { /* keep safe log value */ }
  console.error(`[chat] status=${status} code=${code} provider=${providerHost} model=${model} elapsed_ms=${error.elapsedMs || 0}${upstreamCode ? ` upstream_code=${upstreamCode}` : ''}${error.providerStatus ? ` upstream_status=${error.providerStatus}` : ''} reason=${String(detail || 'unknown').replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>').slice(0, 300)}`);
  return { status, payload: { error: code, message: messages[code] || '大模型服务暂时不可用，请检查网络、模型名称和服务端日志。', detail: error.providerStatus ? `上游 HTTP ${error.providerStatus}。具体原因已记录在服务端日志。` : upstreamCode ? `网络错误：${upstreamCode}。` : '', model } };
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('invalid_json'), { statusCode: 400 });
    if (typeof body.message !== 'string' || !body.message.trim()) throw Object.assign(new Error('message_required'), { statusCode: 400 });
    if (body.message.length > 2000) throw Object.assign(new Error('message_too_long'), { statusCode: 413 });
    const context = cleanChatContext(body.context && typeof body.context === 'object' ? body.context : {});
    return Response.json(await modelChat(body.message, context));
  } catch (error) {
    if (error instanceof SyntaxError) Object.assign(error, { message: 'invalid_json', statusCode: 400 });
    const result = errorPayload(error);
    return Response.json(result.payload, { status: result.status });
  }
}
