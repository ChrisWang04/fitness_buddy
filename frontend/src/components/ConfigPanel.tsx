'use client';

import { useState, useEffect } from 'react';

interface Agent {
  id: string;
  name: string;
  description: string;
}

interface ConfigPanelProps {
  selectedAgent: string;
  userId: number;
  mode: 'invoke' | 'stream';
  threadId: string | null;
  onAgentChange: (agentId: string) => void;
  onUserIdChange: (userId: number) => void;
  onModeChange: (mode: 'invoke' | 'stream') => void;
  onClose?: () => void;
}

export default function ConfigPanel({
  selectedAgent,
  userId,
  mode,
  threadId,
  onAgentChange,
  onUserIdChange,
  onModeChange,
  onClose
}: ConfigPanelProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [userIdInput, setUserIdInput] = useState<string>(userId.toString());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setUserIdInput(userId.toString());
  }, [userId]);

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/agents');
      const data = await response.json();
      
      const transformedAgents = (data.agents || []).map((agent: { key: string; description: string }) => ({
        id: agent.key,
        name: getAgentName(agent.key),
        description: agent.description
      }));
      
      // Filter to only show fitness_buddy agent
      const filteredAgents = transformedAgents.filter((agent: Agent) => agent.id === 'fitness_buddy');
      
      setAgents(filteredAgents);
      
      // Auto-select fitness_buddy if not already selected
      if (filteredAgents.length > 0 && !selectedAgent) {
        onAgentChange('fitness_buddy');
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      // Fallback - only fitness_buddy
      setAgents([
        { id: 'fitness_buddy', name: 'FitnessBuddy', description: 'Build a personalized training & nutrition plan' }
      ]);
      
      // Auto-select fitness_buddy if not already selected
      if (!selectedAgent) {
        onAgentChange('fitness_buddy');
      }
    } finally {
      setLoading(false);
    }
  };

  const getAgentName = (key: string) => {
    const names: Record<string, string> = {
      'fitness_buddy': 'FitnessBuddy'
    };
    return names[key] || key;
  };

  const handleUserIdSubmit = () => {
    const numericUserId = parseInt(userIdInput, 10);
    if (isNaN(numericUserId) || numericUserId <= 0) {
      alert('Please enter a valid positive integer');
      return;
    }
    onUserIdChange(numericUserId);
  };

  return (
    <div style={{
      width: onClose ? '400px' : '320px',
      maxHeight: onClose ? '90vh' : '100vh',
      backgroundColor: 'white',
      borderRight: onClose ? 'none' : '1px solid #e2e8f0',
      borderRadius: onClose ? '12px' : '0',
      boxShadow: onClose ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' : 'none',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Close Button (only shown in modal mode) */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#f1f5f9',
            border: 'none',
            color: '#64748b',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e2e8f0';
            e.currentTarget.style.color = '#1e293b';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f1f5f9';
            e.currentTarget.style.color = '#64748b';
          }}
          title="Close"
        >
          ✕
        </button>
      )}

      {/* Configuration Section */}
      <div style={{
        padding: '20px',
        flex: '0 0 auto',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div>
        <h2 style={{
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#1e293b',
          marginBottom: '8px'
        }}>
          Configuration
        </h2>
        <p style={{
          fontSize: '12px',
          color: '#64748b'
        }}>
          Configure your chat settings
        </p>
      </div>

      {/* Agent Selection */}
      <div>
        <label style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px',
          display: 'block'
        }}>
          Agent
        </label>
        {loading ? (
          <div style={{ color: '#64748b', fontSize: '12px' }}>Loading agents...</div>
        ) : agents.length === 1 ? (
          // If only one agent, show it as read-only
          <div style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            backgroundColor: '#f8fafc',
            color: '#64748b'
          }}>
            {agents[0].name}
          </div>
        ) : (
          <select
            value={selectedAgent}
            onChange={(e) => onAgentChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              backgroundColor: 'white'
            }}
          >
            <option value="">Select an agent</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        )}
        {selectedAgent && (
          <div style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: '#f8fafc',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#475569'
          }}>
            {agents.find(a => a.id === selectedAgent)?.description}
          </div>
        )}
      </div>

      {/* User ID */}
      <div>
        <label style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px',
          display: 'block'
        }}>
          User ID
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="number"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            placeholder="Enter user ID"
            min="1"
            step="1"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          <button
            onClick={handleUserIdSubmit}
            disabled={userIdInput === userId.toString()}
            style={{
              padding: '8px 12px',
              backgroundColor: userIdInput === userId.toString() ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: userIdInput === userId.toString() ? 'not-allowed' : 'pointer'
            }}
          >
            Set
          </button>
        </div>
      </div>

      {/* Mode Selection */}
      <div>
        <label style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px',
          display: 'block'
        }}>
          Response Mode
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onModeChange('invoke')}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: mode === 'invoke' ? '#3b82f6' : '#f1f5f9',
              color: mode === 'invoke' ? 'white' : '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Invoke
          </button>
          <button
            onClick={() => onModeChange('stream')}
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: mode === 'stream' ? '#3b82f6' : '#f1f5f9',
              color: mode === 'stream' ? 'white' : '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Stream
          </button>
        </div>
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: '#64748b'
        }}>
          {mode === 'invoke' ? 'Get complete response at once' : 'Get real-time streaming response'}
        </div>
      </div>

        {/* Current Status */}
        <div style={{
          padding: '12px',
          backgroundColor: '#f0f9ff',
          borderRadius: '8px',
          border: '1px solid #0ea5e9',
          marginTop: '16px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '500', color: '#0369a1', marginBottom: '8px' }}>
            Current Settings
          </div>
          <div style={{ fontSize: '11px', color: '#0369a1', lineHeight: '1.4' }}>
            <div>Agent: {selectedAgent ? getAgentName(selectedAgent) : 'None'}</div>
            <div>User ID: {userId}</div>
            <div>Mode: {mode === 'invoke' ? 'Invoke' : 'Stream'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}