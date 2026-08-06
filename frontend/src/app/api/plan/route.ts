// Read-only proxy for a thread's persisted final plan.
//
// Why this exists: on Vercel Hobby the /api/chat function is hard-capped at 60s
// (maxDuration), but plan generation takes ~80s. The SSE stream therefore gets
// cut before the plan finishes, leaving the card with partial markdown. The Fly
// backend keeps working after the proxy dies and persists the finished plan to
// Supabase, so the client polls this endpoint to fill the card in completely.
//
// This is a fast DB read, so it needs no extended duration of its own.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get('thread_id');
  const userId = searchParams.get('user_id');
  const agentId = searchParams.get('agent_id') || 'xbuddy';

  if (!threadId || !userId) {
    return Response.json(
      { success: false, message: 'thread_id and user_id are required' },
      { status: 400 }
    );
  }

  const isLocal = process.env.NEXT_PUBLIC_API_ENV === 'local';
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    (isLocal
      ? process.env.VALUE_CANVAS_API_URL_LOCAL
      : process.env.VALUE_CANVAS_API_URL_PRODUCTION);

  if (!apiUrl) {
    return Response.json(
      { success: false, message: 'Backend API URL not configured' },
      { status: 500 }
    );
  }

  const target = `${apiUrl}/business_plan/${agentId}?user_id=${encodeURIComponent(
    userId
  )}&thread_id=${encodeURIComponent(threadId)}`;

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        ...(process.env.VALUE_CANVAS_API_TOKEN && {
          Authorization: `Bearer ${process.env.VALUE_CANVAS_API_TOKEN}`,
        }),
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Not-yet-saved is an expected state while polling — report it as a plain
      // "not ready" rather than an error so the client just keeps waiting.
      return Response.json(
        { success: false, message: `Backend returned ${response.status}` },
        { status: 200 }
      );
    }

    const data = await response.json();
    return Response.json(data, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch plan',
      },
      { status: 200 }
    );
  }
}
