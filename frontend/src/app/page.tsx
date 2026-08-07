'use client';

import { useState, useEffect } from 'react';
import ConfigPanel from '@/components/ConfigPanel';
import ChatArea from '@/components/ChatArea';
import ProgressSidebar from '@/components/ProgressSidebar';
import ConversationHistory from '@/components/ConversationHistory';
import SectionDisplayPanel from '@/components/SectionDisplayPanel';
import BusinessPlanEditor from '@/components/BusinessPlanEditor';
import { ConversationRecord, Message } from '@/utils/conversationStorage';

interface Section {
  database_id: number;
  name: string;
  status: string;
}

export default function Chat() {
  const [selectedAgent, setSelectedAgent] = useState<string>('xbuddy');
  const [userId, setUserId] = useState<number>(12);
  const [mode, setMode] = useState<'invoke' | 'stream'>('stream');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState<Section | null>(null);
  const [loadedMessages, setLoadedMessages] = useState<Message[]>([]);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isBusinessPlanEditorOpen, setIsBusinessPlanEditorOpen] = useState<boolean>(false);
  // Bumped when the sidebar's "Edit Full Final Output" is pressed. ChatArea watches
  // this and flips the plan CARD itself into edit mode, in place — the old side
  // panel is no longer how the final plan is edited.
  const [editPlanSignal, setEditPlanSignal] = useState<number>(0);

  const handleAgentChange = (agentId: string) => {
    setSelectedAgent(agentId);
    // Reset conversation when agent changes
    setThreadId(null);
    setCurrentSection(null);
  };

  const handleUserIdChange = (newUserId: number) => {
    setUserId(newUserId);
  };

  const handleModeChange = (newMode: 'invoke' | 'stream') => {
    setMode(newMode);
  };


  const handleThreadIdChange = (newThreadId: string) => {
    setThreadId(newThreadId);
  };

  const handleSectionUpdate = (section: Section) => {
    setCurrentSection(section);
  };

  const handleLoadConversation = (conversation: ConversationRecord) => {
    setThreadId(conversation.threadId);
    setSelectedAgent(conversation.agentType);
    setUserId(conversation.userId);
    setLoadedMessages(conversation.messages);
    
    // Restore section state if available
    if (conversation.currentSection) {
      setCurrentSection(conversation.currentSection);
    } else {
      setCurrentSection(null);
    }
  };

  const handleDeleteConversation = (deletedThreadId: string) => {
    if (threadId === deletedThreadId) {
      setThreadId(null);
      setLoadedMessages([]);
      setCurrentSection(null);
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative'
    }}>

      {/* Settings Modal */}
      {isConfigOpen && (
        <>
          <div
            onClick={() => setIsConfigOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 200,
              animation: 'fadeIn 0.2s ease'
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 201,
            animation: 'slideIn 0.3s ease'
          }}>
            <ConfigPanel
              selectedAgent={selectedAgent}
              userId={userId}
              mode={mode}
              threadId={threadId}
              onAgentChange={handleAgentChange}
              onUserIdChange={handleUserIdChange}
              onModeChange={handleModeChange}
              onClose={() => setIsConfigOpen(false)}
            />
          </div>
        </>
      )}

      {/* Left Sidebar - Progress & Chat History */}
      <div style={{
        width: '320px',
        height: '100vh',
        backgroundColor: '#f8fafc',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Settings Button */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <button
            onClick={() => setIsConfigOpen(true)}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              fontWeight: '600'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#4f46e5';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#6366f1';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            title="Open Settings"
          >
            <span style={{ fontSize: '16px' }}>⚙</span>
            <span>Settings</span>
          </button>
        </div>

        {/* Progress Sidebar - Only show for xbuddy */}
        {selectedAgent === 'xbuddy' && (
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: 'white'
          }}>
            <ProgressSidebar
              currentSection={currentSection}
              selectedAgent={selectedAgent}
              threadId={threadId}
              userId={userId}
              onEditBusinessPlan={() => setEditPlanSignal((n) => n + 1)}
            />
          </div>
        )}

        {/* Chat History */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ConversationHistory
            currentThreadId={threadId}
            selectedAgent={selectedAgent}
            onSelectConversation={handleLoadConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>
      </div>

      <ChatArea
        selectedAgent={selectedAgent}
        userId={userId}
        mode={mode}
        threadId={threadId}
        loadedMessages={loadedMessages}
        currentSection={currentSection}
        onThreadIdChange={handleThreadIdChange}
        onSectionUpdate={handleSectionUpdate}
        editPlanSignal={editPlanSignal}
      />

      {/* Right Sidebar - Section Display Panel or Final Output Editor */}
      <SectionDisplayPanel
        userId={userId}
        selectedAgent={selectedAgent}
        currentSection={currentSection}
        threadId={threadId}
      />
      
      {/* Final Output Editor - Fixed right panel */}
      <BusinessPlanEditor
        threadId={threadId}
        userId={userId}
        isOpen={isBusinessPlanEditorOpen}
        onClose={() => setIsBusinessPlanEditorOpen(false)}
      />

      <style jsx>{`
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
