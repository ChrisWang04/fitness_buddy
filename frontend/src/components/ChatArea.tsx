'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { conversationStorage, ConversationRecord } from '@/utils/conversationStorage';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // When true, this message is the finished FitnessBuddy plan and is rendered as
  // a distinct full-width card (with GFM markdown incl. tables), not a chat bubble.
  isFinalPlan?: boolean;
  // True while the plan card is still being appended to from final_plan_chunk
  // events; cleared once the terminal final_plan event settles it.
  isStreaming?: boolean;
}

interface Section {
  database_id: number;
  name: string;
  status: string;
}

interface ChatAreaProps {
  selectedAgent: string;
  userId: number;
  mode: 'invoke' | 'stream';
  threadId: string | null;
  loadedMessages?: Message[];
  currentSection: Section | null;
  onThreadIdChange: (threadId: string) => void;
  onSectionUpdate: (section: Section) => void;
}

export default function ChatArea({
  selectedAgent,
  userId,
  mode,
  threadId,
  loadedMessages,
  currentSection,
  onThreadIdChange,
  onSectionUpdate
}: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isGeneratingLLM, setIsGeneratingLLM] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);  // auto-conversation button removed; setter still used to reset on thread switch
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoModeRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  // Add keyboard shortcut for auto-reply (Ctrl+G or Cmd+G)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        handleAutoReply();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedAgent, userId, isLoading, isGeneratingLLM, currentSection]);

  // Reset messages when threadId is null (reset button clicked)
  useEffect(() => {
    if (threadId === null) {
      setMessages([]);
      setInput('');
      setStreamingContent('');
      setIsLoading(false);
      setIsAutoMode(false);
      autoModeRef.current = false;
    }
  }, [threadId]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (loadedMessages && loadedMessages.length > 0) {
      setMessages(loadedMessages);
    }
  }, [loadedMessages, threadId]);

  // Save conversation to localStorage when messages or threadId changes
  useEffect(() => {
    if (threadId && messages.length > 0) {
      const conversation: ConversationRecord = {
        threadId,
        agentType: selectedAgent,
        userId,
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        messages,
        title: conversationStorage.generateTitle(messages),
        currentSection: currentSection || undefined
      };
      conversationStorage.save(conversation);
    }
  }, [messages, threadId, selectedAgent, userId, currentSection]);

  // Sync autoModeRef with isAutoMode state
  useEffect(() => {
    autoModeRef.current = isAutoMode;
  }, [isAutoMode]);

  // Auto conversation trigger
  useEffect(() => {
    if (isAutoMode && !isLoading && !isGeneratingLLM && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Only trigger if the last message is from assistant and has content
      if (lastMessage.role === 'assistant' && lastMessage.content && lastMessage.content.trim() !== '') {
        // Small delay to ensure stream is fully closed
        const timer = setTimeout(() => {
          if (autoModeRef.current && !isLoading && !isGeneratingLLM) {
            handleAutoReply(true);
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isAutoMode, isLoading, isGeneratingLLM]);

  const getAgentName = (agentId: string) => {
    const names: Record<string, string> = {
      'xbuddy': 'FitnessBuddy'
    };
    return names[agentId] || 'AI Agent';
  };

  const getPlaceholderText = (agentId: string) => {
    const placeholders: Record<string, string> = {
      'xbuddy': 'Try: "I want to build a workout plan"'
    };
    return placeholders[agentId] || 'Type your message...';
  };

  // Extract send message logic
  const handleSendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || isLoading || !selectedAgent || !userId) return;

    const userMessage: Message = {
      id: Date.now().toString() + '-user',
      role: 'user',
      content: messageContent.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const requestPayload = {
        messages: [{ role: 'user', content: userMessage.content }],
        userId: userId,
        threadId: threadId,
        mode: mode,
        agentId: selectedAgent
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle invoke mode
      if (mode === 'invoke') {
        const invokeData = await response.json();

        const assistantMessage: Message = {
          id: Date.now().toString() + '-assistant',
          role: 'assistant',
          content: invokeData.content
        };

        setMessages(prev => [...prev, assistantMessage]);

        if (invokeData.threadId && !threadId) {
          onThreadIdChange(invokeData.threadId);
        }
        if (invokeData.section) {
          onSectionUpdate(invokeData.section);
        }

        setIsLoading(false);
        return;
      }

      // Handle streaming mode
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body reader available');
      }

      const tempAssistantMessage: Message = {
        id: Date.now().toString() + '-assistant',
        role: 'assistant',
        content: ''
      };

      setMessages(prev => [...prev, tempAssistantMessage]);
      setStreamingContent('');

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                // Stream is complete
                setIsLoading(false);
                setStreamingContent('');
                return;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'token') {
                  // Accumulate tokens for streaming display - no filtering
                  setStreamingContent(prev => {
                    const newContent = prev + parsed.content;
                    setMessages(prevMessages =>
                      prevMessages.map(msg =>
                        msg.id === tempAssistantMessage.id
                          ? { ...msg, content: newContent }
                          : msg
                      )
                    );
                    return newContent;
                  });
                } else if (parsed.type === 'metadata') {
                  // Handle metadata event - extract thread_id
                  if (parsed.content && parsed.content.thread_id && !threadId) {
                    onThreadIdChange(parsed.content.thread_id);
                  }
                } else if (parsed.type === 'message') {
                  // Skip duplicate message events - content is already handled via tokens
                  // The backend sends these but we don't need to process them
                } else if (parsed.type === 'section') {
                  onSectionUpdate(parsed.content);
                } else if (parsed.type === 'final_plan_chunk') {
                  // The plan streams in as it's written. Append each chunk into a
                  // single card so it fills in live, instead of waiting 60-90s for
                  // one all-or-nothing payload at the end.
                  const chunk = parsed.content || '';
                  if (chunk) {
                    setMessages(prev => {
                      const idx = prev.findIndex(m => m.isFinalPlan && m.isStreaming);
                      if (idx === -1) {
                        return [
                          ...prev,
                          {
                            id: Date.now().toString() + '-final-plan',
                            role: 'assistant',
                            content: chunk,
                            isFinalPlan: true,
                            isStreaming: true,
                          },
                        ];
                      }
                      const next = [...prev];
                      next[idx] = { ...next[idx], content: next[idx].content + chunk };
                      return next;
                    });
                  }
                } else if (parsed.type === 'final_plan') {
                  // The finished plan arrives as its own event (never streamed as
                  // tokens). Render it as a standalone big card, NOT glued to the
                  // preceding "does that sound right?" reply bubble.
                  const markdown = parsed.content?.markdown || '';
                  if (markdown) {
                    setMessages(prev => {
                      // The plan normally arrives via final_plan_chunk; this event
                      // is the authoritative full text that closes it out. Settle
                      // the streamed card with it (covers any dropped chunk) rather
                      // than appending a second copy.
                      const idx = prev.findIndex(m => m.isFinalPlan && m.isStreaming);
                      if (idx !== -1) {
                        const next = [...prev];
                        next[idx] = { ...next[idx], content: markdown, isStreaming: false };
                        return next;
                      }
                      // De-dupe: a reconnect/retry can re-emit final_plan; don't add
                      // a second identical card.
                      return prev.some(m => m.isFinalPlan && m.content === markdown)
                        ? prev
                        : [
                            ...prev,
                            {
                              id: Date.now().toString() + '-final-plan',
                              role: 'assistant',
                              content: markdown,
                              isFinalPlan: true,
                            },
                          ];
                    });
                  }
                } else if (parsed.type === 'final_response') {
                  // Thread identity is owned solely by the 'metadata' event.
                  // Do NOT set threadId here: final_response may carry a
                  // per-request id, and the stale render-closure `threadId`
                  // (still null within turn 1) would let it clobber the correct
                  // thread_id, fragmenting the conversation across thread_ids.
                  if (parsed.section) {
                    onSectionUpdate(parsed.section);
                  }
                  setMessages(prevMessages =>
                    prevMessages.map(msg =>
                      msg.id === tempAssistantMessage.id
                        ? { ...msg, content: parsed.content }
                        : msg
                    )
                  );
                }
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
        // Ensure loading is set to false when stream ends
        setIsLoading(false);
      }

    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: Date.now().toString() + '-error',
        role: 'assistant',
        content: `Sorry, an error occurred while connecting to ${getAgentName(selectedAgent)}. Please try again.`
      };
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
      // Stop auto mode on error
      if (isAutoMode) {
        setIsAutoMode(false);
      }
    }
  }, [isLoading, selectedAgent, userId, threadId, mode, onThreadIdChange, onSectionUpdate, isAutoMode]);

  const handleAutoReply = useCallback(async (autoSend = false) => {
    if (isLoading || isGeneratingLLM || !selectedAgent || !userId) return;

    setIsGeneratingLLM(true);

    try {
      // Call LLM API to generate response
      const response = await fetch('/api/llm-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
          agentType: selectedAgent,
          currentSection: currentSection?.name || null
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate LLM response');
      }

      const data = await response.json();

      if (autoSend) {
        // Auto send the message
        await handleSendMessage(data.message);
      } else {
        // Set the generated message in the input for preview
        setInput(data.message);

        // Focus the input field so user can review/edit before sending
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);
      }

    } catch (error) {
      console.error('Error generating LLM response:', error);
      if (!autoSend) {
        // Fallback message only for manual mode
        setInput('Yes, let\'s continue.');
      }
    } finally {
      setIsGeneratingLLM(false);
    }
  }, [isLoading, isGeneratingLLM, selectedAgent, userId, messages, currentSection, handleSendMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSendMessage(input);
  };

  const canSendMessage = selectedAgent && userId && input.trim() && !isLoading && !isAutoMode;

  const copyToClipboard = async (text: string, messageId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (messageId) {
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 1500);
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const copyAllConversation = async () => {
    const conversationText = messages.map(msg => {
      const role = msg.role === 'user' ? '👤 User' : `🤖 ${getAgentName(selectedAgent)}`;
      return `${role}:\n${msg.content}`;
    }).join('\n\n' + '='.repeat(50) + '\n\n');
    
    await copyToClipboard(conversationText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
         <div style={{ flex: 1 }}>
           <h1 style={{
             fontSize: '20px',
             fontWeight: 'bold',
             color: '#1e293b',
             margin: 0,
             display: 'flex',
             alignItems: 'center',
             gap: '8px'
           }}>
             {selectedAgent ? getAgentName(selectedAgent) : 'Select an Agent'}
             {isAutoMode && (
               <span style={{
                 fontSize: '12px',
                 padding: '2px 8px',
                 backgroundColor: '#dc2626',
                 color: 'white',
                 borderRadius: '4px',
                 fontWeight: 'normal',
                 animation: 'pulse 2s infinite'
               }}>
                 AUTO MODE
               </span>
             )}
           </h1>
           {selectedAgent && (
             <p style={{
               fontSize: '12px',
               color: '#64748b',
               margin: '4px 0 0 0'
             }}>
               {selectedAgent === 'xbuddy' && 'Build a personalized training & nutrition plan'}
             </p>
           )}
         </div>

         {messages.length > 0 && (
           <button
             onClick={copyAllConversation}
             style={{
               padding: '8px 12px',
               backgroundColor: copiedAll ? '#059669' : '#10b981',
               color: 'white',
               border: 'none',
               borderRadius: '6px',
               fontSize: '12px',
               cursor: 'pointer',
               display: 'flex',
               alignItems: 'center',
               gap: '4px',
               transition: 'all 0.2s ease',
               transform: copiedAll ? 'scale(1.05)' : 'scale(1)',
               whiteSpace: 'nowrap'
             }}
             title={copiedAll ? "Copied all messages!" : "Copy all conversation"}
           >
             {copiedAll ? '✓ Copied!' : '📋 Copy All'}
           </button>
         )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        backgroundColor: '#f8fafc'
      }}>
        {!selectedAgent ? (
          <div style={{
            textAlign: 'center',
            paddingTop: '100px',
            color: '#64748b'
          }}>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>
              👈 Please select an agent from the left panel to start chatting
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            paddingTop: '100px',
            color: '#64748b'
          }}>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>
              🚀 Start your conversation with {getAgentName(selectedAgent)}
            </div>
            <div style={{ fontSize: '12px' }}>
              {getPlaceholderText(selectedAgent)}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.map((message) => {
              // The finished plan renders as a distinct, full-width "big card"
              // — not a normal chat bubble — with GFM markdown (tables included).
              if (message.isFinalPlan) {
                return (
                  <div key={message.id} style={{ display: 'flex', justifyContent: 'stretch', width: '100%' }}>
                    <div style={{
                      width: '100%',
                      border: '2px solid #6366f1',
                      borderRadius: '16px',
                      background: 'linear-gradient(180deg, #eef2ff 0%, #ffffff 120px)',
                      boxShadow: '0 6px 20px rgba(99, 102, 241, 0.18)',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      <div style={{
                        padding: '16px 24px',
                        borderBottom: '1px solid #e0e7ff',
                        background: '#6366f1',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span style={{ fontSize: '18px', fontWeight: 700 }}>🎉 Your Personalized Plan</span>
                        <button
                          onClick={() => copyToClipboard(message.content, message.id)}
                          style={{
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '6px',
                            backgroundColor: copiedMessageId === message.id ? '#10b981' : 'rgba(255,255,255,0.2)',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                          title={copiedMessageId === message.id ? 'Copied!' : 'Copy plan'}
                        >
                          {copiedMessageId === message.id ? '✓ Copied' : '📋 Copy'}
                        </button>
                      </div>
                      <div style={{ padding: '24px 28px', fontSize: '15px', lineHeight: '1.6', color: '#1e293b' }}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => <h1 style={{ margin: '0 0 16px 0', fontSize: '24px', fontWeight: 700, color: '#3730a3' }}>{children}</h1>,
                            h2: ({ children }) => <h2 style={{ margin: '24px 0 10px 0', fontSize: '19px', fontWeight: 700, color: '#4338ca', borderBottom: '1px solid #e0e7ff', paddingBottom: '4px' }}>{children}</h2>,
                            h3: ({ children }) => <h3 style={{ margin: '16px 0 8px 0', fontSize: '16px', fontWeight: 700 }}>{children}</h3>,
                            p: ({ children }) => <p style={{ margin: '0 0 12px 0' }}>{children}</p>,
                            ul: ({ children }) => <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px' }}>{children}</ul>,
                            ol: ({ children }) => <ol style={{ margin: '0 0 12px 0', paddingLeft: '20px' }}>{children}</ol>,
                            li: ({ children }) => <li style={{ margin: '4px 0' }}>{children}</li>,
                            strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                            em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                            table: ({ children }) => (
                              <div style={{ overflowX: 'auto', margin: '8px 0 16px 0' }}>
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '14px' }}>{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => <thead style={{ backgroundColor: '#eef2ff' }}>{children}</thead>,
                            th: ({ children }) => <th style={{ border: '1px solid #c7d2fe', padding: '8px 10px', textAlign: 'left', fontWeight: 700 }}>{children}</th>,
                            td: ({ children }) => <td style={{ border: '1px solid #e2e8f0', padding: '8px 10px', verticalAlign: 'top' }}>{children}</td>,
                            code: ({ children }) => <code style={{ backgroundColor: '#f1f5f9', padding: '2px 4px', borderRadius: '3px', fontSize: '13px', fontFamily: 'monospace' }}>{children}</code>,
                            blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #6366f1', paddingLeft: '12px', margin: '12px 0', fontStyle: 'italic', color: '#475569' }}>{children}</blockquote>,
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
              <div key={message.id} style={{
                display: 'flex',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <div style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  backgroundColor: message.role === 'user' ? '#3b82f6' : '#ffffff',
                  color: message.role === 'user' ? 'white' : '#1e293b',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  position: 'relative'
                }}>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: '500',
                    marginBottom: '4px',
                    opacity: 0.7
                  }}>
                    {message.role === 'user' ? 'You' : getAgentName(selectedAgent)}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    lineHeight: '1.5',
                    whiteSpace: message.role === 'user' ? 'pre-wrap' : 'normal'
                  }}>
                    {message.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                          h1: ({ children }) => <h1 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold' }}>{children}</h1>,
                          h2: ({ children }) => <h2 style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'bold' }}>{children}</h2>,
                          h3: ({ children }) => <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 'bold' }}>{children}</h3>,
                          ul: ({ children }) => <ul style={{ margin: '0 0 8px 0', paddingLeft: '16px' }}>{children}</ul>,
                          ol: ({ children }) => <ol style={{ margin: '0 0 8px 0', paddingLeft: '16px' }}>{children}</ol>,
                          li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
                          strong: ({ children }) => <strong style={{ fontWeight: 'bold' }}>{children}</strong>,
                          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                          code: ({ children }) => <code style={{ 
                            backgroundColor: '#f1f5f9', 
                            padding: '2px 4px', 
                            borderRadius: '3px', 
                            fontSize: '13px',
                            fontFamily: 'monospace'
                          }}>{children}</code>,
                          pre: ({ children }) => <pre style={{ 
                            backgroundColor: '#f1f5f9', 
                            padding: '8px', 
                            borderRadius: '6px', 
                            overflow: 'auto',
                            margin: '8px 0'
                          }}>{children}</pre>,
                          blockquote: ({ children }) => <blockquote style={{ 
                            borderLeft: '3px solid #cbd5e1', 
                            paddingLeft: '12px', 
                            margin: '8px 0',
                            fontStyle: 'italic'
                          }}>{children}</blockquote>
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>
                  {message.role === 'assistant' && (
                    <button
                      onClick={() => copyToClipboard(message.content, message.id)}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '24px',
                        height: '24px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: copiedMessageId === message.id ? '#10b981' : '#f1f5f9',
                        color: copiedMessageId === message.id ? 'white' : '#64748b',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.7,
                        transition: 'all 0.2s ease',
                        transform: copiedMessageId === message.id ? 'scale(1.1)' : 'scale(1)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                      title={copiedMessageId === message.id ? "Copied!" : "Copy message"}
                    >
                      {copiedMessageId === message.id ? '✓' : '📋'}
                    </button>
                  )}
                </div>
              </div>
              );
            })}

            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  backgroundColor: '#ffffff',
                  color: '#1e293b',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <div style={{
                    fontSize: '10px',
                    fontWeight: '500',
                    marginBottom: '4px',
                    opacity: 0.7
                  }}>
                    {getAgentName(selectedAgent)}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #f3f4f6',
                      borderTop: '2px solid #3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }}></div>
                    {mode === 'stream' ? 'Thinking...' : 'Processing...'}
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '16px 24px',
        backgroundColor: 'white',
        borderTop: '1px solid #e2e8f0'
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isAutoMode ? 'Auto conversation in progress...' : (selectedAgent ? getPlaceholderText(selectedAgent) : 'Select an agent first...')}
            disabled={!selectedAgent || !userId || isGeneratingLLM || isAutoMode}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: isAutoMode ? '#f9fafb' : 'white',
              cursor: isAutoMode ? 'not-allowed' : 'text'
            }}
          />
          <button
            type="button"
            onClick={() => handleAutoReply(false)}
            disabled={!selectedAgent || !userId || isLoading || isGeneratingLLM || isAutoMode}
            style={{
              padding: '12px 20px',
              backgroundColor: isGeneratingLLM
                ? '#fbbf24'
                : (!selectedAgent || !userId || isLoading || isAutoMode)
                  ? '#d1d5db'
                  : '#10b981',
              color: 'white',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              cursor: (!selectedAgent || !userId || isLoading || isGeneratingLLM || isAutoMode) ? 'not-allowed' : 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            title="Generate response using AI (for testing)"
          >
            {isGeneratingLLM ? (
              <>
                <div style={{
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}></div>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <span>🤖</span>
                <span>Auto Reply</span>
              </>
            )}
          </button>
          <button
            type="submit"
            disabled={!canSendMessage}
            style={{
              padding: '12px 24px',
              backgroundColor: canSendMessage ? '#3b82f6' : '#9ca3af',
              color: 'white',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              cursor: canSendMessage ? 'pointer' : 'not-allowed',
              fontWeight: '500'
            }}
          >
            Send
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}