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
  const agentId = searchParams.get('agent_id') || 'fitness_buddy';

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

// Persist a user-edited plan. Proxies to the backend rather than writing via the
// browser's Supabase client: RLS blocks the anon key on business_plans (anon
// SELECT returns 0 rows while the service role sees every row), so a direct
// client-side write would silently succeed while changing nothing.
export async function POST(request: Request) {
  let body: { thread_id?: string; user_id?: number | string; markdown?: string; agent_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const { thread_id, user_id, markdown } = body;
  const agentId = body.agent_id || 'fitness_buddy';

  if (!thread_id || user_id === undefined || user_id === null || typeof markdown !== 'string') {
    return Response.json(
      { success: false, message: 'thread_id, user_id and markdown are required' },
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
    return Response.json({ success: false, message: 'Backend API URL not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`${apiUrl}/business_plan/${agentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.VALUE_CANVAS_API_TOKEN && {
          Authorization: `Bearer ${process.env.VALUE_CANVAS_API_TOKEN}`,
        }),
      },
      body: JSON.stringify({ user_id: Number(user_id), thread_id, markdown }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json(
        { success: false, message: data?.detail || `Backend returned ${response.status}` },
        { status: 502 }
      );
    }
    return Response.json({ success: true, ...data }, { status: 200 });
  } catch (error) {
    return Response.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to save plan' },
      { status: 502 }
    );
  }
}
