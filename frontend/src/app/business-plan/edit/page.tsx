'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TiptapEditor from '@/components/TiptapEditor';
import { supabase } from '@/lib/supabase';

function EditBusinessPlanContent() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get('thread_id') || '';
  const userId = parseInt(searchParams.get('user_id') || '1', 10);

  const [content, setContent] = useState<any>(null);
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load final-output from Supabase
  useEffect(() => {
    if (!threadId) {
      setError('Missing thread_id');
      setLoading(false);
      return;
    }

    loadBusinessPlan();
  }, [threadId, userId]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!supabase || !threadId) return;

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
          if (payload.new && payload.new.content) {
            // Convert markdown to Tiptap JSON if needed
            const newContent = payload.new.content;
            setContent(convertToTiptapFormat(newContent));
            setMarkdownContent(payload.new.markdown_content || payload.new.content);
            setLastSaved(new Date());
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [threadId]);

  const loadBusinessPlan = async () => {
    if (!supabase) {
      const errorMsg = 'Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local';
      console.error(errorMsg);
      setError(errorMsg);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('Loading final-output:', { userId, threadId });

      const { data, error: fetchError } = await supabase
        .from('business_plans')
        .select('content, markdown_content, updated_at')
        .eq('user_id', userId)
        .eq('thread_id', threadId)
        .maybeSingle();

      console.log('Supabase query result:', { data, error: fetchError });

      if (fetchError) {
        console.error('Supabase fetch error:', fetchError);
        throw new Error(`Database error: ${fetchError.message || fetchError.code || 'Unknown error'}`);
      }

      if (data && data.content) {
        // Convert markdown to Tiptap JSON format
        const tiptapContent = convertToTiptapFormat(data.content);
        setContent(tiptapContent);
        setMarkdownContent(data.markdown_content || data.content);
        setLastSaved(new Date(data.updated_at));
        console.log('Business plan loaded successfully');
      } else {
        setError('Business plan not found. Please generate a final-output first by completing all sections.');
      }
    } catch (err: any) {
      console.error('Error loading final-output:', err);
      const errorMessage = err.message || err.toString() || 'Failed to load final-output';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
      setContent(newContent);
      
      if (!supabase || !threadId) {
        console.warn('Cannot save: missing supabase or threadId');
        return;
      }

      // Debounce: save after 1 second of no changes
      const timeoutId = setTimeout(async () => {
        if (!supabase || !threadId) {
          console.warn('Cannot save: missing supabase or threadId');
          return;
        }

        try {
          setSaving(true);
          setError(null);
          
          // Convert Tiptap JSON to markdown/text
          const markdownText = convertTiptapToMarkdown(newContent);

          console.log('Saving final-output:', { userId, threadId });

          const { data, error: saveError } = await supabase
            .from('business_plans')
            .upsert({
              user_id: userId,
              thread_id: threadId,
              agent_id: 'xbuddy',
              content: markdownText, // Save as markdown text
              markdown_content: markdownText,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,thread_id',
            });

          console.log('Save result:', { data, error: saveError });

          if (saveError) {
            console.error('Supabase save error:', saveError);
            throw new Error(`Save failed: ${saveError.message || saveError.code || 'Unknown error'}`);
          }

          setMarkdownContent(markdownText);
          setLastSaved(new Date());
          console.log('Business plan saved successfully');
        } catch (err: any) {
          console.error('Error saving final-output:', err);
          const errorMessage = err.message || err.toString() || 'Failed to save content';
          setError(errorMessage);
        } finally {
          setSaving(false);
        }
      }, 1000);

      return () => clearTimeout(timeoutId);
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 mb-2">Error: {error}</p>
            <button
              onClick={loadBusinessPlan}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Edit Final Output</h1>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {saving && (
              <span className="text-blue-600">Saving...</span>
            )}
            {lastSaved && !saving && (
              <span className="text-green-600">
                Saved at {lastSaved.toLocaleTimeString()}
              </span>
            )}
            {error && (
              <span className="text-red-600">Error: {error}</span>
            )}
          </div>
        </div>

        {/* Editor */}
        {content && (
          <TiptapEditor
            content={content}
            onChange={handleContentChange}
            sectionId="final-output"
            threadId={threadId}
            userId={userId}
            editable={true}
            placeholder="Edit your final-output..."
          />
        )}

        {/* Footer */}
        <div className="mt-4 text-sm text-gray-500">
          <p>Changes are automatically saved. This final-output syncs in real-time with other users.</p>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditBusinessPlanPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EditBusinessPlanContent />
    </Suspense>
  );
}




