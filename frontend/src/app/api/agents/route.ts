export async function GET() {
  try {
    const isLocal = process.env.NEXT_PUBLIC_API_ENV === 'local';
    const apiUrl = isLocal 
      ? process.env.VALUE_CANVAS_API_URL_LOCAL 
      : process.env.VALUE_CANVAS_API_URL_PRODUCTION;
    
    // If API URL is not configured, return fallback
    if (!apiUrl) {
      console.warn('Backend API URL not configured. Using fallback agents list.');
      const fallbackAgents = {
        agents: [
          {
            key: 'fitness_buddy',
            description: 'A FitnessBuddy agent that builds a personalized training and nutrition plan through a structured conversation about goals, profile, schedule, preferences, and nutrition'
          }
        ]
      };
      return Response.json(fallbackAgents);
    }
    
    // Add timeout with AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${apiUrl}/info`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.VALUE_CANVAS_API_TOKEN && {
          'Authorization': `Bearer ${process.env.VALUE_CANVAS_API_TOKEN}`
        })
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter to only return fitness_buddy agent
    if (data.agents && Array.isArray(data.agents)) {
      data.agents = data.agents.filter((agent: { key: string }) => agent.key === 'fitness_buddy');
    }
    
    return Response.json(data);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    
    // Fallback - only fitness_buddy agent
    const fallbackAgents = {
      agents: [
        {
          key: 'fitness_buddy',
          description: 'A FitnessBuddy agent that builds a personalized training and nutrition plan through a structured conversation about goals, profile, schedule, preferences, and nutrition'
        }
      ]
    };
    
    return Response.json(fallbackAgents);
  }
}

