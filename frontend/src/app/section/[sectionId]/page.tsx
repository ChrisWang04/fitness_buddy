'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import TiptapEditor from '@/components/TiptapEditor';
import { supabase } from '@/lib/supabase';

// Section ID mapping
const SECTION_NAMES: Record<string, string> = {
  goals: 'Goals',
  profile: 'Profile',
  schedule: 'Schedule',
  preferences: 'Preferences',
  nutrition: 'Nutrition',
};

function SectionEditorContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sectionId = params.sectionId as string;
  const threadId = searchParams.get('thread_id') || '';
  const userId = parseInt(searchParams.get('user_id') || '1', 10);

  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load section content from Supabase
  useEffect(() => {
    if (!threadId || !sectionId) {
      setError('Missing thread_id or section_id');
      setLoading(false);
      return;
    }

    loadSectionContent();
  }, [threadId, sectionId, userId]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!supabase || !threadId || !sectionId) return;

    const channel = supabase
      .channel(`section:${sectionId}:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'section_states',
          filter: `thread_id=eq.${threadId} AND section_id=eq.${sectionId}`,
        },
        (payload) => {
          console.log('Realtime update received:', payload);
          if (payload.new && payload.new.content) {
            setContent(payload.new.content);
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
  }, [threadId, sectionId]);

  const loadSectionContent = async () => {
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

      console.log('Loading section content:', { userId, threadId, sectionId });

      const { data, error: fetchError } = await supabase
        .from('section_states')
        .select('content, plain_text, status, updated_at')
        .eq('user_id', userId)
        .eq('thread_id', threadId)
        .eq('section_id', sectionId)
        .maybeSingle();

      console.log('Supabase query result:', { data, error: fetchError });

      if (fetchError) {
        console.error('Supabase fetch error:', fetchError);
        throw new Error(`Database error: ${fetchError.message || fetchError.code || 'Unknown error'}`);
      }

      if (data && data.content) {
        setContent(data.content);
        setLastSaved(new Date(data.updated_at));
        console.log('Content loaded successfully');
      } else {
        // Initialize with empty content if no data exists
        console.log('No existing content found, initializing empty editor');
        setContent({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
            },
          ],
        });
      }
    } catch (err: any) {
      console.error('Error loading section content:', err);
      const errorMessage = err.message || err.toString() || 'Failed to load section content';
      setError(errorMessage);
      
      // Provide helpful error messages
      if (errorMessage.includes('JWT') || errorMessage.includes('token')) {
        setError('Invalid Supabase API key. Please check NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
      } else if (errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
        setError('Database table not found. Please ensure migration has been run.');
      } else if (errorMessage.includes('permission') || errorMessage.includes('policy')) {
        setError('Permission denied. Please check Supabase RLS policies.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = useCallback(
    async (newContent: any) => {
      setContent(newContent);
      
      if (!supabase || !threadId || !sectionId) {
        console.warn('Cannot save: missing supabase, threadId, or sectionId');
        return;
      }

      // Debounce: save after 1 second of no changes
      const timeoutId = setTimeout(async () => {
        if (!supabase || !threadId || !sectionId) {
          console.warn('Cannot save: missing supabase, threadId, or sectionId');
          return;
        }

        try {
          setSaving(true);
          setError(null);
          
          // Convert Tiptap JSON to plain text for storage
          const plainText = extractPlainText(newContent);

          console.log('Saving section content:', { userId, threadId, sectionId });

          const { data, error: saveError } = await supabase
            .from('section_states')
            .upsert({
              user_id: userId,
              thread_id: threadId,
              section_id: sectionId,
              agent_id: 'xbuddy',
              content: newContent,
              plain_text: plainText,
              status: 'in_progress',
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,thread_id,section_id',
            });

          console.log('Save result:', { data, error: saveError });

          if (saveError) {
            console.error('Supabase save error:', saveError);
            throw new Error(`Save failed: ${saveError.message || saveError.code || 'Unknown error'}`);
          }

          setLastSaved(new Date());
          console.log('Section content saved successfully');
        } catch (err: any) {
          console.error('Error saving section content:', err);
          const errorMessage = err.message || err.toString() || 'Failed to save content';
          setError(errorMessage);
          
          // Provide helpful error messages
          if (errorMessage.includes('JWT') || errorMessage.includes('token')) {
            setError('Invalid Supabase API key. Please check NEXT_PUBLIC_SUPABASE_ANON_KEY');
          } else if (errorMessage.includes('permission') || errorMessage.includes('policy')) {
            setError('Permission denied. Please check Supabase RLS policies.');
          }
        } finally {
          setSaving(false);
        }
      }, 1000);

      return () => clearTimeout(timeoutId);
    },
    [threadId, sectionId, userId]
  );

  // Extract plain text from Tiptap JSON
  const extractPlainText = (tiptapJson: any): string => {
    if (!tiptapJson || !tiptapJson.content) return '';
    
    const extractText = (node: any): string => {
      if (node.type === 'text') {
        return node.text || '';
      }
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractText).join('');
      }
      return '';
    };

    return tiptapJson.content.map(extractText).join('\n').trim();
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
            <p className="text-red-800">Error: {error}</p>
            <button
              onClick={loadSectionContent}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sectionName = SECTION_NAMES[sectionId] || sectionId;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{sectionName}</h1>
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
        <TiptapEditor
          content={content}
          onChange={handleContentChange}
          sectionId={sectionId}
          threadId={threadId}
          userId={userId}
          editable={true}
          placeholder={`Edit ${sectionName.toLowerCase()} content...`}
        />

        {/* Footer */}
        <div className="mt-4 text-sm text-gray-500">
          <p>Changes are automatically saved. This section syncs in real-time with other users.</p>
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

export default function SectionEditorPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SectionEditorContent />
    </Suspense>
  );
}

