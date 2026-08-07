'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface Section {
  database_id: number;
  name: string;
  status: string;
}

interface ProgressSidebarProps {
  currentSection: Section | null;
  selectedAgent: string;
  threadId?: string | null;
  userId?: number;
  onEditBusinessPlan?: () => void;
}

// Define all sections for xbuddy
const FOUNDER_BUDDY_SECTIONS = [
  { id: 'goals', name: 'Goals', displayName: 'Goals' },
  { id: 'profile', name: 'Profile', displayName: 'Profile' },
  { id: 'schedule', name: 'Schedule', displayName: 'Schedule' },
  { id: 'preferences', name: 'Preferences', displayName: 'Preferences' },
  { id: 'nutrition', name: 'Nutrition', displayName: 'Nutrition' }
];

export default function ProgressSidebar({ 
  currentSection, 
  selectedAgent, 
  threadId, 
  userId,
  onEditBusinessPlan
}: ProgressSidebarProps) {
  const router = useRouter();

  // Get status for a section
  const getSectionStatus = (sectionId: string): 'pending' | 'in_progress' | 'completed' => {
    if (!currentSection) return 'pending';
    
    // Match by section name (case-insensitive)
    const currentSectionName = currentSection.name.toLowerCase();
    const sectionName = sectionId.toLowerCase();
    
    // Check if this is the current section
    if (currentSectionName.includes(sectionName) || sectionName.includes(currentSectionName)) {
      if (currentSection.status === 'completed' || currentSection.status === 'done') {
        return 'completed';
      }
      return 'in_progress';
    }
    
    // Check if sections before this one are completed
    const currentIndex = FOUNDER_BUDDY_SECTIONS.findIndex(s => 
      currentSectionName.includes(s.id) || currentSectionName.includes(s.name.toLowerCase())
    );
    const sectionIndex = FOUNDER_BUDDY_SECTIONS.findIndex(s => s.id === sectionId);
    
    if (currentIndex > sectionIndex) {
      return 'completed';
    }
    
    return 'pending';
  };

  const getStatusColor = (status: 'pending' | 'in_progress' | 'completed') => {
    switch (status) {
      case 'completed':
        return '#10b981'; // green
      case 'in_progress':
        return '#6366f1'; // purple
      default:
        return '#94a3b8'; // gray
    }
  };

  const getStatusText = (status: 'pending' | 'in_progress' | 'completed') => {
    switch (status) {
      case 'completed':
        return 'Done';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Pending';
    }
  };

  // For xbuddy, show vertical list of all sections
  if (selectedAgent === 'xbuddy') {
    return (
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '700',
          color: '#1e293b',
          marginBottom: '4px',
          padding: '0 4px'
        }}>
          Progress
        </div>
        {FOUNDER_BUDDY_SECTIONS.map((section, index) => {
          const status = getSectionStatus(section.id);
          const isCurrent = currentSection && (
            currentSection.name.toLowerCase().includes(section.id) ||
            currentSection.name.toLowerCase().includes(section.name.toLowerCase())
          );

          return (
            <div
              key={section.id}
              style={{
                padding: '14px 16px',
                backgroundColor: isCurrent ? '#f0f9ff' : '#ffffff',
                border: isCurrent ? '2px solid #6366f1' : '1px solid #e2e8f0',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'all 0.2s ease',
                boxShadow: isCurrent ? '0 2px 8px rgba(99, 102, 241, 0.15)' : 'none',
                transform: isCurrent ? 'scale(1.02)' : 'scale(1)'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flex: 1
                }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: getStatusColor(status),
                    flexShrink: 0,
                    boxShadow: isCurrent ? `0 0 8px ${getStatusColor(status)}` : 'none'
                  }}></div>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: isCurrent ? '700' : '600',
                    color: isCurrent ? '#6366f1' : '#1e293b',
                    letterSpacing: '-0.01em'
                  }}>
                    {section.displayName}
                  </span>
                </div>
                <span style={{
                  fontSize: '11px',
                  color: getStatusColor(status),
                  fontWeight: '600',
                  padding: '2px 8px',
                  backgroundColor: status === 'completed' ? '#d1fae5' : 
                                 status === 'in_progress' ? '#e0e7ff' : '#f1f5f9',
                  borderRadius: '12px',
                  whiteSpace: 'nowrap'
                }}>
                  {getStatusText(status)}
                </span>
              </div>
              {isCurrent && currentSection && (
                <div style={{
                  fontSize: '11px',
                  color: '#64748b',
                  marginTop: '2px',
                  paddingLeft: '20px',
                  fontStyle: 'italic'
                }}>
                  Currently working on this section
                </div>
              )}
            </div>
          );
        })}
        
        {/* Edit Full Final Output Button - Show at bottom if threadId and userId are available */}
        {threadId && userId && (
          <div style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid #e2e8f0'
          }}>
            <button
              onClick={() => {
                if (onEditBusinessPlan) {
                  onEditBusinessPlan();
                } else {
                  router.push(`/final-output/edit?thread_id=${threadId}&user_id=${userId}`);
                }
              }}
              style={{
                width: '100%',
                fontSize: '14px',
                fontWeight: '600',
                color: 'white',
                backgroundColor: '#6366f1',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#4f46e5';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(99, 102, 241, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#6366f1';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(99, 102, 241, 0.2)';
              }}
              title="Edit the complete final-output after all sections are finished"
            >
              <span>📝</span>
              <span>Edit Full Final Output</span>
            </button>
            <div style={{
              fontSize: '11px',
              color: '#64748b',
              marginTop: '8px',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              Available after plan is generated
            </div>
          </div>
        )}
      </div>
    );
  }

  // For other agents, show simple display
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      alignItems: 'center'
    }}>
      {currentSection ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            padding: '6px 12px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '12px',
            color: '#1e293b',
            fontWeight: '500'
          }}>
            #{currentSection.database_id}
          </div>
          <div style={{
            padding: '6px 12px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            fontSize: '12px',
            color: '#1e293b',
            fontWeight: '500'
          }}>
            {currentSection.name}
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: '12px',
          color: '#94a3b8',
          fontStyle: 'italic'
        }}>
          Start a conversation to see progress
        </div>
      )}
    </div>
  );
}