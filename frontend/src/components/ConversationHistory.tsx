'use client';

import { useState, useEffect } from 'react';
import { conversationStorage, ConversationRecord } from '@/utils/conversationStorage';

interface ConversationHistoryProps {
  currentThreadId: string | null;
  selectedAgent: string;
  onSelectConversation: (conversation: ConversationRecord) => void;
  onDeleteConversation?: (threadId: string) => void;
}

const agentIcons: Record<string, string> = {
  'fitness_buddy': '🏋️',
};

export default function ConversationHistory({
  currentThreadId,
  selectedAgent,
  onSelectConversation,
  onDeleteConversation
}: ConversationHistoryProps) {
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadConversations = () => {
    const allConversations = conversationStorage.getAll();
    setConversations(allConversations);
  };

  const handleDelete = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      conversationStorage.delete(threadId);
      loadConversations();
      if (onDeleteConversation) {
        onDeleteConversation(threadId);
      }
    }
  };

  const handleClearAll = () => {
    if (confirm('Delete all conversation history?')) {
      conversationStorage.clear();
      loadConversations();
    }
  };

  const handleNewConversation = () => {
    window.location.reload();
  };

  const filteredConversations = conversations.filter(conv => {
    return filter === 'all' || conv.agentType === filter;
  });

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f8fafc'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px',
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h3 style={{ 
            margin: 0, 
            fontSize: '14px', 
            fontWeight: 600,
            color: '#1e293b'
          }}>
            Conversations
          </h3>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                color: '#64748b',
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              title="Filter conversations"
            >
              🔽 Filter
            </button>
            {conversations.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  color: '#ef4444',
                  background: 'white',
                  border: '1px solid #fecaca',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                title="Clear all conversations"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* New Conversation Button */}
        <button
          onClick={handleNewConversation}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span style={{ fontSize: '16px' }}>+</span>
          New Conversation
        </button>

        {/* Filter Pills */}
        {showFilters && (
          <div style={{ 
            marginTop: '12px',
            display: 'flex', 
            gap: '4px', 
            flexWrap: 'wrap' 
          }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: filter === 'all' ? '#3b82f6' : 'white',
                color: filter === 'all' ? 'white' : '#64748b',
                border: `1px solid ${filter === 'all' ? '#3b82f6' : '#e2e8f0'}`,
                borderRadius: '12px',
                cursor: 'pointer'
              }}
            >
              All ({conversations.length})
            </button>
            {Object.entries(agentIcons).map(([agent, icon]) => {
              const count = conversations.filter(c => c.agentType === agent).length;
              if (count === 0) return null;
              return (
                <button
                  key={agent}
                  onClick={() => setFilter(agent)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    background: filter === agent ? '#3b82f6' : 'white',
                    color: filter === agent ? 'white' : '#64748b',
                    border: `1px solid ${filter === agent ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {icon} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversations List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px'
      }}>
        {filteredConversations.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#94a3b8',
            padding: '32px 16px',
            fontSize: '13px'
          }}>
            {conversations.length === 0 
              ? 'No conversations yet. Start a new conversation above.'
              : 'No conversations match the selected filter.'}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {filteredConversations.map(conv => (
              <div
                key={conv.threadId}
                onClick={() => onSelectConversation(conv)}
                style={{
                  padding: '12px',
                  background: currentThreadId === conv.threadId 
                    ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' 
                    : 'white',
                  border: currentThreadId === conv.threadId
                    ? '2px solid #6366f1'
                    : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                  boxShadow: currentThreadId === conv.threadId 
                    ? '0 10px 25px -5px rgba(99, 102, 241, 0.3)' 
                    : '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
                onMouseEnter={(e) => {
                  if (currentThreadId !== conv.threadId) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (currentThreadId !== conv.threadId) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '6px'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    flex: 1
                  }}>
                    <span style={{ 
                      fontSize: '16px',
                      filter: currentThreadId === conv.threadId ? 'grayscale(0) brightness(1.2)' : 'none'
                    }}>
                      {agentIcons[conv.agentType] || '💬'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: currentThreadId === conv.threadId ? 'white' : '#1e293b',
                        marginBottom: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {conv.title || 'New Conversation'}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: currentThreadId === conv.threadId ? 'rgba(255,255,255,0.8)' : '#64748b'
                      }}>
                        {conversationStorage.formatDate(conv.lastUpdatedAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, conv.threadId)}
                    className="delete-btn"
                    style={{
                      padding: '2px 6px',
                      fontSize: '12px',
                      color: currentThreadId === conv.threadId ? 'rgba(255,255,255,0.9)' : '#6b7280',
                      background: currentThreadId === conv.threadId 
                        ? 'rgba(255,255,255,0.15)' 
                        : 'rgba(239, 68, 68, 0.05)',
                      border: currentThreadId === conv.threadId
                        ? '1px solid rgba(255,255,255,0.2)'
                        : '1px solid rgba(239, 68, 68, 0.1)',
                      cursor: 'pointer',
                      opacity: 0.7,
                      transition: 'all 0.2s',
                      borderRadius: '6px',
                      fontWeight: '500'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.background = currentThreadId === conv.threadId 
                        ? 'rgba(255,255,255,0.25)' 
                        : 'rgba(239, 68, 68, 0.15)';
                      e.currentTarget.style.color = currentThreadId === conv.threadId 
                        ? 'white' 
                        : '#dc2626';
                      e.currentTarget.style.borderColor = currentThreadId === conv.threadId
                        ? 'rgba(255,255,255,0.3)'
                        : 'rgba(239, 68, 68, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.7';
                      e.currentTarget.style.background = currentThreadId === conv.threadId 
                        ? 'rgba(255,255,255,0.15)' 
                        : 'rgba(239, 68, 68, 0.05)';
                      e.currentTarget.style.color = currentThreadId === conv.threadId 
                        ? 'rgba(255,255,255,0.9)' 
                        : '#6b7280';
                      e.currentTarget.style.borderColor = currentThreadId === conv.threadId
                        ? 'rgba(255,255,255,0.2)'
                        : 'rgba(239, 68, 68, 0.1)';
                    }}
                    title="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: currentThreadId === conv.threadId ? 'rgba(255,255,255,0.9)' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap'
                }}>
                  <span>{conv.messages.length} messages</span>
                  <span>•</span>
                  <span>{conv.agentType.split(/[-_]/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}</span>
                  {conv.currentSection && (
                    <>
                      <span>•</span>
                      <span style={{
                        backgroundColor: currentThreadId === conv.threadId ? 'rgba(255,255,255,0.2)' : '#f3f4f6',
                        color: currentThreadId === conv.threadId ? 'white' : '#6b7280',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '600',
                        border: currentThreadId === conv.threadId 
                          ? '1px solid rgba(255,255,255,0.3)' 
                          : '1px solid #e5e7eb'
                      }}>
                        📍 {conv.currentSection.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}