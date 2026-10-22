export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const roomName = String(body?.room?.roomName || '当前空间');
    const selection = Array.isArray(body?.selection) ? body.selection.slice(0, 12) : [];
    if (!selection.length || selection.some(id => typeof id !== 'string' || !/^[a-z-]{1,40}$/.test(id))) throw new Error('invalid_selection');
    return Response.json({ message: `${roomName}摆放示意已更新（${selection.length} 件家具）。当前是 2D 示意图，不是照片合成。`, mode: 'mock', selection });
  } catch (error) {
    return Response.json({ error: 'preview_invalid', message: error.message }, { status: 400 });
  }
}
