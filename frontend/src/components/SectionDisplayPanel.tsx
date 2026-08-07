'use client';

import { useState, useEffect } from 'react';

interface SectionData {
  section_id: number | string; // number for value-canvas, string for xbuddy
  section_name: string;
  name?: string; // Display name
  is_completed: boolean;
  has_content: boolean;
  current_version: number;
  ai_interaction_count: number;
  status?: string; // 'pending', 'in_progress', 'done'
  created_at?: string;
  updated_at?: string;
}

interface SectionContent {
  content: {
    text: string;
  };
  is_completed: boolean;
  current_version: number;
  created_at: string;
  updated_at: string;
}

interface SectionDisplayPanelProps {
  userId: number;
  selectedAgent: string;
  currentSection: { database_id: number; name: string; status: string } | null;
  threadId: string | null;
}

const SECTION_DISPLAY_NAMES: Record<number | string, string> = {
  // Value Canvas sections
  45: 'Initial Interview',
  46: 'Ideal Customer Persona (ICP)',
  47: 'ICP Stress Test',
  48: 'The Pain',
  49: 'The Deep Fear',
  50: 'The Payoffs',
  51: 'Pain-Payoff Symmetry',
  52: 'Signature Method',
  53: 'The Mistakes',
  54: 'The Prize',
  // Concept Pitch sections
  9001: 'Summary Confirmation',
  9002: 'Pitch Generation',
  9003: 'Pitch Selection',
  9004: 'Refinement',
  // FitnessBuddy sections
  'goals': 'Goals',
  'profile': 'Profile',
  'schedule': 'Schedule',
  'preferences': 'Preferences',
  'nutrition': 'Nutrition',
};

const REFINE_STYLES: Record<string, string> = {
  'concise': 'Make the content more concise and to the point',
  'detailed': 'Add more details and explanations to make it comprehensive',
  'professional': 'Rewrite in a more professional and formal tone',
  'engaging': 'Make it more engaging and compelling for the reader',
  'simple': 'Simplify the language to make it easier to understand'
};

export default function SectionDisplayPanel({ userId, selectedAgent, currentSection, threadId }: SectionDisplayPanelProps) {
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | string | null>(null);
  const [sectionContent, setSectionContent] = useState<SectionContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refinedContent, setRefinedContent] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('');

  useEffect(() => {
    if (userId && selectedAgent === 'xbuddy') {
      fetchSections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedAgent, currentSection, threadId]);

  const fetchSections = async () => {
    setLoading(true);
    setError(null);
    try {
      // For XBuddy, fetch from Supabase via API
      const response = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          threadId: threadId, // Pass threadId to get sections for current conversation
          action: 'get-all-sections'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sections');
      }

      const data = await response.json();
      if (data.success) {
        // Handle empty sections list gracefully
        if (data.data?.sections && Array.isArray(data.data.sections) && data.data.sections.length > 0) {
          setSections(data.data.sections);
        } else {
          // No sections yet - this is normal for new conversations
          setSections([]);
          setError(null); // Clear any previous errors
        }
      } else {
        // API returned an error, but don't show it as a critical error
        // Just set empty sections
        console.warn('Sections API returned error:', data.message);
        setSections([]);
        setError(null);
      }
    } catch (err) {
      // Network or other errors - show warning but don't block UI
      console.warn('Error fetching sections:', err);
      setSections([]);
      setError(null); // Don't show error for network issues
    } finally {
      setLoading(false);
    }
  };

  const fetchSectionContent = async (sectionId: number | string) => {
    setLoadingContent(true);
    setSectionContent(null);
    setError(null);
    
    if (!threadId) {
      console.error('No threadId available for fetching section content');
      setError('No active conversation. Please start a conversation first.');
      setLoadingContent(false);
      return;
    }
    
    console.log('Fetching section content:', { userId, threadId, sectionId });
    
    try {
      // For XBuddy, fetch from Supabase via API
      const response = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          threadId: threadId, // Required for get-section-content
          action: 'get-section-content',
          sectionId: sectionId
        })
      });
      
      console.log('Fetch response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error('Failed to fetch section content');
      }

      const data = await response.json();
      console.log('Section content API response:', { success: data.success, data: data.data, sectionId });
      
      if (data.success) {
        if (data.data) {
          // Handle different data formats from Supabase API
          const apiData = data.data;
          console.log('API data structure:', { 
            hasContent: !!apiData.content, 
            contentType: typeof apiData.content,
            contentKeys: typeof apiData.content === 'object' ? Object.keys(apiData.content || {}) : null
          });
          
          // Supabase API returns: { content: { text: "..." }, is_completed: true, ... }
          const contentText = typeof apiData.content === 'string' 
            ? apiData.content 
            : apiData.content?.text || apiData.content || '';
          
          console.log('Extracted content text length:', contentText?.length || 0);
          
          // Normalize to expected format
          const normalizedContent: SectionContent = {
            content: {
              text: contentText
            },
            is_completed: apiData.is_completed || false,
            current_version: apiData.current_version || 1,
            created_at: apiData.created_at || new Date().toISOString(),
            updated_at: apiData.updated_at || new Date().toISOString()
          };
          setSectionContent(normalizedContent);
          setError(null);
        } else {
          // Section not found in database - this is normal for new sections
          console.log('No section data found in response');
          setSectionContent(null);
          setError(null);
        }
      } else {
        // API returned an error
        console.error('API error:', data.message);
        throw new Error(data.message || 'Failed to fetch section content');
      }
    } catch (err) {
      console.error('Error fetching section content:', err);
      setError(err instanceof Error ? err.message : 'Failed to load section content');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSectionChange = (sectionId: string) => {
    // Handle both numeric (value-canvas) and string (xbuddy) section IDs
    const id = isNaN(Number(sectionId)) ? sectionId : Number(sectionId);
    setSelectedSectionId(id);
    if (id) {
      fetchSectionContent(id);
    }
  };

  const getSelectedSection = () => {
    return sections.find(s => s.section_id === selectedSectionId);
  };

  const handleRefineClick = () => {
    setShowRefineModal(true);
    setRefinedContent(null);
    setSelectedStyle('');
  };

  const handleRefineExecute = async () => {
    if (!selectedStyle || !selectedSectionId || !threadId) {
      alert('Please select a refine style and ensure you have an active conversation');
      return;
    }

    setRefineLoading(true);
    try {
      const response = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          threadId: threadId,
          action: 'refine-section',
          sectionId: selectedSectionId,
          refinementPrompt: REFINE_STYLES[selectedStyle]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to refine section');
      }

      const data = await response.json();
      if (data.success && data.data?.refined_content) {
        // Handle both formats: refined_content.text (legacy) or refined_content.plain_text (new)
        const refinedText = data.data.refined_content.text || data.data.refined_content.plain_text;
        if (refinedText) {
          setRefinedContent(refinedText);
        } else {
          throw new Error('Refined content format not recognized');
        }
      } else {
        throw new Error(data.message || 'Invalid response format');
      }
    } catch (err) {
      console.error('Error refining section:', err);
      alert('Failed to refine section: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setRefineLoading(false);
    }
  };

  const handleReplaceContent = async () => {
    if (!refinedContent || !selectedSectionId || !threadId) return;

    try {
      // 1. Update database
      const updateResponse = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          action: 'update-section-content',
          sectionId: selectedSectionId,
          content: refinedContent
        })
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update section in database');
      }

      // 2. Sync LangGraph state
      const syncResponse = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          threadId: threadId,
          action: 'sync-section',
          sectionId: selectedSectionId
        })
      });

      if (!syncResponse.ok) {
        throw new Error('Failed to sync LangGraph state');
      }

      // 3. Refresh displayed content
      await fetchSectionContent(selectedSectionId);
      setShowRefineModal(false);
      setRefinedContent(null);
      setSelectedStyle('');
    } catch (err) {
      console.error('Error replacing content:', err);
      alert('Failed to replace content: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (selectedAgent !== 'xbuddy') {
    return null;
  }

  const selectedSection = getSelectedSection();

  return (
    <div style={{
      width: '500px',
      height: '100vh',
      backgroundColor: 'white',
      borderLeft: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#ffffff'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '700',
            color: '#1e293b',
            margin: '0 0 4px 0'
          }}>
            📄 Section Viewer
          </h2>
          <p style={{
            fontSize: '12px',
            color: '#64748b',
            margin: 0
          }}>
            User #{userId}
          </p>
        </div>

        {/* Dropdown Selector */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={selectedSectionId || ''}
            onChange={(e) => handleSectionChange(e.target.value)}
            disabled={loading || sections.length === 0}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#1e293b',
              backgroundColor: 'white',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = '#6366f1'}
            onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          >
            <option value="">Select a section to view</option>
            {sections.map((section) => {
              const displayName = section.name || SECTION_DISPLAY_NAMES[section.section_id] || section.section_name;
              return (
                <option key={section.section_id} value={String(section.section_id)}>
                  {typeof section.section_id === 'string' ? '' : `#${section.section_id} - `}{displayName}
                  {section.is_completed ? ' ✓' : ''}
                  {section.status && section.status !== 'pending' ? ` (${section.status})` : ''}
                </option>
              );
            })}
          </select>

          <button
            onClick={fetchSections}
            disabled={loading}
            style={{
              padding: '10px 14px',
              backgroundColor: loading ? '#e2e8f0' : '#6366f1',
              color: loading ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#4f46e5')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#6366f1')}
            title="Refresh sections"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        backgroundColor: '#f8fafc'
      }}>
        {error && (
          <div style={{
            margin: '20px',
            padding: '16px',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#92400e',
            border: '1px solid #fde68a'
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading && sections.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: '#64748b'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e2e8f0',
              borderTop: '3px solid #6366f1',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px'
            }}></div>
            <p style={{ fontSize: '13px', margin: 0 }}>Loading sections...</p>
          </div>
        ) : sections.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: '#94a3b8',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
            <p style={{ fontSize: '14px', fontWeight: '500', color: '#64748b', margin: '0 0 8px 0' }}>
              No sections available yet
            </p>
            <p style={{ fontSize: '12px', margin: 0 }}>
              Sections will appear here as you progress through the conversation
            </p>
          </div>
        ) : !selectedSectionId ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: '#94a3b8',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <p style={{ fontSize: '14px', fontWeight: '500', color: '#64748b', margin: '0 0 8px 0' }}>
              Select a section to view
            </p>
            <p style={{ fontSize: '12px', margin: 0 }}>
              Choose from the dropdown above to see section content
            </p>
          </div>
        ) : loadingContent ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: '#64748b'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e2e8f0',
              borderTop: '3px solid #6366f1',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '16px'
            }}></div>
            <p style={{ fontSize: '13px', margin: 0 }}>Loading content...</p>
          </div>
        ) : sectionContent ? (
          <div style={{ padding: '20px' }}>
            {/* Section Info Card */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  backgroundColor: selectedSection?.is_completed ? '#dcfce7' : '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  flexShrink: 0
                }}>
                  {selectedSection?.is_completed ? '✓' : '📝'}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{
                    fontSize: '15px',
                    fontWeight: '700',
                    color: '#1e293b',
                    margin: '0 0 4px 0'
                  }}>
                    {selectedSection && SECTION_DISPLAY_NAMES[selectedSection.section_id]}
                  </h3>
                  <div style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{
                      backgroundColor: '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: '500'
                    }}>
                      Section #{selectedSectionId}
                    </span>
                    <span>Version {sectionContent.current_version}</span>
                    <span>•</span>
                    <span>{selectedSection?.ai_interaction_count || 0} interactions</span>
                  </div>
                </div>
                <div style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  backgroundColor: selectedSection?.is_completed ? '#dcfce7' : '#fef3c7',
                  color: selectedSection?.is_completed ? '#166534' : '#92400e',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {selectedSection?.is_completed ? 'Completed' : 'In Progress'}
                </div>
              </div>
            </div>

            {/* Content Card */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Content
                </div>
                <button
                  onClick={handleRefineClick}
                  disabled={!threadId || !sectionContent?.content?.text}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: (!threadId || !sectionContent?.content?.text) ? '#e2e8f0' : '#8b5cf6',
                    color: (!threadId || !sectionContent?.content?.text) ? '#94a3b8' : 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: (!threadId || !sectionContent?.content?.text) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (threadId && sectionContent?.content?.text) {
                      e.currentTarget.style.backgroundColor = '#7c3aed';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (threadId && sectionContent?.content?.text) {
                      e.currentTarget.style.backgroundColor = '#8b5cf6';
                    }
                  }}
                  title={!threadId ? 'Active conversation required. Start a conversation first.' : (!sectionContent?.content?.text ? 'No content to refine' : 'Refine this section with AI')}
                >
                  ✨ Refine
                </button>
              </div>
              <div style={{
                fontSize: '13px',
                lineHeight: '1.7',
                color: '#1e293b',
                whiteSpace: 'pre-wrap',
                backgroundColor: '#f8fafc',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                minHeight: '200px',
                maxHeight: '500px',
                overflowY: 'auto'
              }}>
                {sectionContent?.content?.text || (
                  <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                    No content available for this section
                  </span>
                )}
              </div>

              {/* Metadata */}
              <div style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                fontSize: '11px',
                color: '#64748b'
              }}>
                <div>
                  <span style={{ fontWeight: '600' }}>Created:</span>{' '}
                  {new Date(sectionContent.created_at).toLocaleString()}
                </div>
                <div>
                  <span style={{ fontWeight: '600' }}>Updated:</span>{' '}
                  {new Date(sectionContent.updated_at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            color: '#94a3b8',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <p style={{ fontSize: '14px', fontWeight: '500', color: '#64748b', margin: 0 }}>
              Failed to load content
            </p>
          </div>
        )}
      </div>

      {/* Refine Modal */}
      {showRefineModal && (
        <>
          <div
            onClick={() => setShowRefineModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              animation: 'fadeIn 0.2s ease'
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideIn 0.3s ease'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: '700',
                  color: '#1e293b',
                  margin: '0 0 4px 0'
                }}>
                  ✨ Refine Section Content
                </h3>
                <p style={{
                  fontSize: '13px',
                  color: '#64748b',
                  margin: '0 0 4px 0'
                }}>
                  {selectedSection && SECTION_DISPLAY_NAMES[selectedSection.section_id]}
                </p>
                <p style={{
                  fontSize: '11px',
                  color: '#8b5cf6',
                  margin: 0,
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span>🔗 Thread:</span>
                  <code style={{
                    backgroundColor: '#f5f3ff',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace'
                  }}>
                    {threadId}
                  </code>
                </p>
              </div>
              <button
                onClick={() => setShowRefineModal(false)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
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
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px'
            }}>
              {/* Style Selection */}
              {!refinedContent && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#1e293b',
                    marginBottom: '8px'
                  }}>
                    Select Refine Style
                  </label>
                  <select
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                    disabled={refineLoading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#1e293b',
                      backgroundColor: 'white',
                      cursor: refineLoading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <option value="">Choose a style...</option>
                    <option value="concise">✂️ More Concise</option>
                    <option value="detailed">📝 More Detailed</option>
                    <option value="professional">💼 More Professional</option>
                    <option value="engaging">🎯 More Engaging</option>
                    <option value="simple">💡 Simpler Language</option>
                  </select>
                  {selectedStyle && (
                    <p style={{
                      marginTop: '8px',
                      fontSize: '12px',
                      color: '#64748b',
                      fontStyle: 'italic'
                    }}>
                      {REFINE_STYLES[selectedStyle]}
                    </p>
                  )}
                </div>
              )}

              {/* Original Content */}
              <div style={{ marginBottom: refinedContent ? '16px' : '0' }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#64748b',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {refinedContent ? 'Original Content' : 'Current Content'}
                </div>
                <div style={{
                  padding: '16px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                  lineHeight: '1.7',
                  color: '#1e293b',
                  whiteSpace: 'pre-wrap',
                  maxHeight: refinedContent ? '300px' : '400px',
                  overflowY: 'auto'
                }}>
                  {sectionContent?.content.text || 'No content'}
                </div>
              </div>

              {/* Refined Content Preview */}
              {refinedContent && (
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#8b5cf6',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    ✨ Refined Content
                  </div>
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#faf5ff',
                    borderRadius: '8px',
                    border: '2px solid #8b5cf6',
                    fontSize: '13px',
                    lineHeight: '1.7',
                    color: '#1e293b',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    {refinedContent}
                  </div>
                </div>
              )}

              {/* Loading State */}
              {refineLoading && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px',
                  color: '#64748b'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid #e2e8f0',
                    borderTop: '3px solid #8b5cf6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '16px'
                  }}></div>
                  <p style={{ fontSize: '14px', margin: 0 }}>Refining content...</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '20px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setShowRefineModal(false);
                  setRefinedContent(null);
                  setSelectedStyle('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f1f5f9',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              >
                Cancel
              </button>
              {!refinedContent ? (
                <button
                  onClick={handleRefineExecute}
                  disabled={!selectedStyle || refineLoading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: (!selectedStyle || refineLoading) ? '#e2e8f0' : '#8b5cf6',
                    color: (!selectedStyle || refineLoading) ? '#94a3b8' : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: (!selectedStyle || refineLoading) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedStyle && !refineLoading) {
                      e.currentTarget.style.backgroundColor = '#7c3aed';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedStyle && !refineLoading) {
                      e.currentTarget.style.backgroundColor = '#8b5cf6';
                    }
                  }}
                >
                  ✨ Refine
                </button>
              ) : (
                <button
                  onClick={handleReplaceContent}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                >
                  ✓ Replace Content
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>
    </div>
  );
}
