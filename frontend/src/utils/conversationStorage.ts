export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface Section {
  database_id: number;
  name: string;
  status: string;
}

export interface ConversationRecord {
  threadId: string;
  agentType: string;
  userId: number;
  createdAt: string;
  lastUpdatedAt: string;
  messages: Message[];
  title?: string;
  currentSection?: Section;
}

const STORAGE_KEY = 'dent_conversations';
const MAX_CONVERSATIONS = 50;

export const conversationStorage = {
  getAll(): ConversationRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const parsed: ConversationRecord[] = data ? JSON.parse(data) : [];
      // Conversations saved before the xbuddy -> fitness_buddy rename still carry the old
      // agent key; normalize so reopening them calls the renamed API route.
      return parsed.map(c => (c.agentType === 'xbuddy' ? { ...c, agentType: 'fitness_buddy' } : c));
    } catch (error) {
      console.error('Error loading conversations:', error);
      return [];
    }
  },

  save(conversation: ConversationRecord): void {
    try {
      const conversations = this.getAll();
      const existingIndex = conversations.findIndex(c => c.threadId === conversation.threadId);
      
      if (existingIndex >= 0) {
        conversations[existingIndex] = {
          ...conversations[existingIndex],
          ...conversation,
          lastUpdatedAt: new Date().toISOString()
        };
      } else {
        conversations.unshift(conversation);
        
        if (conversations.length > MAX_CONVERSATIONS) {
          conversations.pop();
        }
      }
      
      // Remove sorting to maintain creation order
      // Only sort when initially loading from storage
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  },

  get(threadId: string): ConversationRecord | null {
    try {
      const conversations = this.getAll();
      return conversations.find(c => c.threadId === threadId) || null;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  },

  delete(threadId: string): void {
    try {
      const conversations = this.getAll();
      const filtered = conversations.filter(c => c.threadId !== threadId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing conversations:', error);
    }
  },

  generateTitle(messages: Message[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) return 'New Conversation';
    
    const content = firstUserMessage.content;
    const maxLength = 50;
    
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  },

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
};