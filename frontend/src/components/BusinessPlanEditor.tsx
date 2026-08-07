'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import TiptapEditor from './TiptapEditor';
import { supabase } from '@/lib/supabase';

interface BusinessPlanEditorProps {
  threadId: string | null;
  userId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function BusinessPlanEditor({
  threadId,
  userId,
  isOpen,
  onClose,
}: BusinessPlanEditorProps) {
  const [content, setContent] = useState<any>(null);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Use refs to track saving state and prevent loops
  const isSavingRef = useRef(false);
  const lastSavedContentRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const establishRealtimeSubscription = useCallback(async () => {
    if (!threadId || !userId) return;
    
    try {
      // Get API URL from environment
      const apiEnv = process.env.NEXT_PUBLIC_API_ENV || 'local';
      const apiUrl = apiEnv === 'local' 
        ? process.env.NEXT_PUBLIC_VALUE_CANVAS_API_URL_LOCAL || 'http://localhost:8080'
        : process.env.NEXT_PUBLIC_VALUE_CANVAS_API_URL_PRODUCTION;
      
      if (!apiUrl) {
        console.warn('Backend API URL not configured. Realtime subscription may not work.');
        return;
      }
      
      // Call backend API to establish Realtime subscription
      const response = await fetch(`${apiUrl}/realtime/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          thread_id: threadId,
          agent_id: 'xbuddy',
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.warn('Failed to establish Realtime subscription:', errorData.message || 'Unknown error');
        return;
      }
      
      const result = await response.json();
      if (result.success) {
        console.log('✅ Realtime subscription established:', result.message);
      } else {
        console.warn('⚠️ Realtime subscription failed:', result.message);
      }
    } catch (error) {
      console.error('Error establishing Realtime subscription:', error);
      // Don't throw - this is not critical for the editor to function
    }
  }, [threadId, userId]);

  const loadBusinessPlan = async () => {
    if (!supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    if (!threadId) {
      setError('Missing thread_id');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('business_plans')
        .select('content, markdown_content, updated_at')
        .eq('user_id', userId)
        .eq('thread_id', threadId)
        .maybeSingle();

      if (fetchError) {
        throw new Error(`Database error: ${fetchError.message || fetchError.code || 'Unknown error'}`);
      }

      if (data && data.content) {
        const tiptapContent = convertToTiptapFormat(data.content);
        const markdown = data.markdown_content || data.content;
        setContent(tiptapContent);
        setMarkdownContent(markdown);
        lastSavedContentRef.current = markdown; // Initialize ref
        setLastSaved(new Date(data.updated_at));
      } else {
        setError('Business plan not found. Please complete all sections to generate a final-output first.');
      }
    } catch (err: any) {
      console.error('Error loading final-output:', err);
      setError(err.message || 'Failed to load final-output');
    } finally {
      setLoading(false);
    }
  };

  // Establish Realtime subscription when editor opens
  useEffect(() => {
    if (isOpen && threadId) {
      establishRealtimeSubscription();
    }
  }, [isOpen, threadId, establishRealtimeSubscription]);

  // Load final-output when opened
  useEffect(() => {
    if (isOpen && threadId) {
      loadBusinessPlan();
    }
  }, [isOpen, threadId, userId]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!supabase || !threadId || !isOpen) return;

    const channel = supabase
      .channel(`final-output:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'business_plans',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          console.log('Realtime update received:', payload);
          
          // Ignore updates if we're currently saving (to prevent loops)
          if (isSavingRef.current) {
            console.log('Ignoring realtime update - currently saving');
            return;
          }
          
          if (payload.new && payload.new.content) {
            const newMarkdown = payload.new.markdown_content || payload.new.content;
            
            // Only update if content is actually different
            if (newMarkdown !== lastSavedContentRef.current) {
              const newContent = convertToTiptapFormat(payload.new.content);
              setContent(newContent);
              setMarkdownContent(newMarkdown);
              lastSavedContentRef.current = newMarkdown;
              setLastSaved(new Date());
            } else {
              console.log('Realtime update ignored - content unchanged');
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [threadId, isOpen]);

  // Convert markdown/text to Tiptap JSON format
  const convertToTiptapFormat = (text: string): any => {
    if (!text) {
      return {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      };
    }

    // If text is already JSON, try to parse it
    try {
      const parsed = JSON.parse(text);
      if (parsed.type === 'doc') {
        return parsed;
      }
    } catch {
      // Not JSON, continue with markdown conversion
    }

    // Simple markdown to Tiptap conversion
    const lines = text.split('\n');
    const content: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) {
        continue;
      }

      // Headers
      if (line.startsWith('# ')) {
        content.push({
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: line.substring(2) }],
        });
      } else if (line.startsWith('## ')) {
        content.push({
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: line.substring(3) }],
        });
      } else if (line.startsWith('### ')) {
        content.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: line.substring(4) }],
        });
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // Bullet list
        const listItems: any[] = [];
        let j = i;
        while (j < lines.length && (lines[j].startsWith('- ') || lines[j].startsWith('* '))) {
          listItems.push({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: lines[j].substring(2).trim() }],
            }],
          });
          j++;
        }
        if (listItems.length > 0) {
          content.push({
            type: 'bulletList',
            content: listItems,
          });
          i = j - 1;
        }
      } else {
        // Regular paragraph
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        });
      }
    }

    return {
      type: 'doc',
      content: content.length > 0 ? content : [{ type: 'paragraph' }],
    };
  };

  const handleContentChange = useCallback(
    async (newContent: any) => {
      // Don't update content state here - let TiptapEditor manage its own state
      // Only save to database
      
      if (!supabase || !threadId) {
        return;
      }

      // Clear previous timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce: save after 1 second of no changes
      saveTimeoutRef.current = setTimeout(async () => {
        if (!supabase || !threadId) {
          console.warn('Cannot save: missing supabase or threadId');
          return;
        }

        try {
          isSavingRef.current = true;
          setSaving(true);
          setError(null);
          
          const markdownText = convertTiptapToMarkdown(newContent);
          
          // Only save if content actually changed
          if (markdownText === lastSavedContentRef.current) {
            console.log('Skipping save - content unchanged');
            isSavingRef.current = false;
            setSaving(false);
            return;
          }

          console.log('Saving final-output...');
          const { error: saveError } = await supabase
            .from('business_plans')
            .upsert({
              user_id: userId,
              thread_id: threadId,
              agent_id: 'xbuddy',
              content: markdownText,
              markdown_content: markdownText,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,thread_id',
            });

          if (saveError) {
            throw new Error(`Save failed: ${saveError.message || saveError.code || 'Unknown error'}`);
          }

          // Update refs and state after successful save
          lastSavedContentRef.current = markdownText;
          setMarkdownContent(markdownText);
          setLastSaved(new Date());
          
          // Small delay before allowing realtime updates again
          setTimeout(() => {
            isSavingRef.current = false;
            setSaving(false);
          }, 500);
        } catch (err: any) {
          console.error('Error saving final-output:', err);
          setError(err.message || 'Failed to save content');
          isSavingRef.current = false;
          setSaving(false);
        }
      }, 1000);
    },
    [threadId, userId]
  );

  // Convert Tiptap JSON to markdown
  const convertTiptapToMarkdown = (tiptapJson: any): string => {
    if (!tiptapJson || !tiptapJson.content) return '';
    
    const convertNode = (node: any): string => {
      if (node.type === 'text') {
        return node.text || '';
      }
      
      if (node.type === 'paragraph') {
        const text = node.content ? node.content.map(convertNode).join('') : '';
        return text + '\n\n';
      }
      
      if (node.type === 'heading') {
        const level = node.attrs?.level || 1;
        const text = node.content ? node.content.map(convertNode).join('') : '';
        const prefix = '#'.repeat(level) + ' ';
        return prefix + text.trim() + '\n\n';
      }
      
      if (node.type === 'bulletList') {
        const items = node.content ? node.content.map((item: any) => {
          const text = item.content ? item.content.map(convertNode).join('').trim() : '';
          return '- ' + text;
        }).join('\n') : '';
        return items + '\n\n';
      }
      
      if (node.type === 'listItem') {
        const text = node.content ? node.content.map(convertNode).join('').trim() : '';
        return text;
      }
      
      if (node.type === 'hardBreak') {
        return '\n';
      }
      
      if (node.content) {
        return node.content.map(convertNode).join('');
      }
      
      return '';
    };

    return tiptapJson.content.map(convertNode).join('').trim();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '500px',
      height: '100vh',
      backgroundColor: 'white',
      borderLeft: '1px solid #e2e8f0',
      boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f8fafc'
      }}>
        <div>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '700',
            color: '#1e293b',
            margin: 0,
            marginBottom: '4px'
          }}>
            Edit Final Output
          </h2>
          <div style={{
            fontSize: '12px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            {saving && (
              <span style={{ color: '#6366f1' }}>Saving...</span>
            )}
            {lastSaved && !saving && (
              <span style={{ color: '#10b981' }}>
                Saved at {lastSaved.toLocaleTimeString()}
              </span>
            )}
            {error && (
              <span style={{ color: '#ef4444' }}>Error: {error}</span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            color: '#64748b',
            padding: '4px 8px',
            borderRadius: '4px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f1f5f9';
            e.currentTarget.style.color = '#1e293b';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#64748b';
          }}
          title="Close editor"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '20px'
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#64748b'
          }}>
            <div>
              <div style={{ marginBottom: '8px' }}>Loading final-output...</div>
              <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid #e2e8f0',
                borderTopColor: '#6366f1',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto'
              }}></div>
            </div>
          </div>
        ) : error && !content ? (
          <div style={{
            padding: '16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b'
          }}>
            <p style={{ margin: '0 0 12px 0', fontWeight: '600' }}>Error</p>
            <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>{error}</p>
            <button
              onClick={loadBusinessPlan}
              style={{
                padding: '6px 12px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500'
              }}
            >
              Retry
            </button>
          </div>
        ) : content ? (
          <div>
            <TiptapEditor
              content={content}
              onChange={handleContentChange}
              sectionId="final-output"
              threadId={threadId || ''}
              userId={userId}
              editable={true}
              placeholder="Edit your final-output..."
            />
            <div style={{
              marginTop: '12px',
              fontSize: '11px',
              color: '#64748b',
              textAlign: 'center'
            }}>
              Changes are automatically saved
            </div>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

