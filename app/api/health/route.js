import { furnitureCatalog } from '../../../server.js';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    ok: true,
    modelConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
    furnitureCatalogCount: furnitureCatalog.length
  });
}
