import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import customerApi from '../../api/customer';
import { useAuth } from '../../context/AuthContext';
import TopHeader from '../../components/shared/TopHeader';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS = 3;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];

const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
};

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const getFileIcon = (mimeType) => {
  if (mimeType?.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'picture_as_pdf';
  if (mimeType === 'text/plain') return 'description';
  return 'attach_file';
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const SupportChat = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const backTo = typeof location.state?.backTo === 'string' ? location.state.backTo : null;

  const handleBackToHelp = useCallback(() => {
    navigate('/support', backTo ? { replace: true, state: { backTo } } : { replace: true });
  }, [backTo, navigate]);
  
  // Session state
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  
  // Messages state
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  
  // Input state
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [adminTyping, setAdminTyping] = useState(false);
  
  // Session closed state
  const [sessionClosed, setSessionClosed] = useState(false);
  const [closeMessage, setCloseMessage] = useState('');
  
  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const sessionIdRef = useRef(null);
  
  // Keep sessionIdRef in sync with session state
  useEffect(() => {
    sessionIdRef.current = session?.id || null;
  }, [session?.id]);
  
  // Pre-fill subject from warning context
  useEffect(() => {
    const warningSubject = searchParams.get('subject');
    if (warningSubject) {
      setSubject(warningSubject);
    }
  }, [searchParams]);
  
  // Socket connection - only connect once when user is available
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || !user) return;
    
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
    const baseUrl = apiUrl.replace(/\/api\/?$/, '');
    
    const socket = io(`${baseUrl}/market`, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[Support] Socket connected');
    });
    
    socket.on('support:message', (data) => {
      // Use ref to get current session ID
      if (data.session_id === sessionIdRef.current) {
        setMessages(prev => [...prev, data.message]);
        // Mark as read
        customerApi.markSupportMessagesRead(data.session_id, [data.message.id]).catch(() => {});
      }
    });
    
    socket.on('support:typing', (data) => {
      if (data.session_id === sessionIdRef.current && data.role === 'admin') {
        setAdminTyping(data.is_typing);
      }
    });
    
    socket.on('support:session_update', (data) => {
      if (data.session?.id === sessionIdRef.current) {
        setSession(data.session);
      }
    });
    
    socket.on('support:session_closed', (data) => {
      if (data.session_id === sessionIdRef.current) {
        setSessionClosed(true);
        setCloseMessage(data.message || 'Session has been closed by admin.');
      }
    });
    
    return () => {
      socket.disconnect();
    };
  }, [user]);
  
  // Load current session
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await customerApi.getCurrentSupportSession();
        
        if (response.session) {
          setSession(response.session);
          setShowNewSessionModal(false);
        } else {
          setShowNewSessionModal(true);
        }
      } catch (err) {
        setError(err.message || 'Failed to load support session');
      } finally {
        setLoading(false);
      }
    };
    
    loadSession();
  }, []);
  
  // Load messages when session is available
  useEffect(() => {
    if (!session?.id) return;
    
    const loadMessages = async () => {
      try {
        setLoadingMessages(true);
        const response = await customerApi.getSupportMessages(session.id, { limit: 50 });
        setMessages(response.messages || []);
        setHasMore(response.hasMore);
        setCursor(response.cursor);
        
        // Mark all as read
        if (response.messages?.length > 0) {
          await customerApi.markSupportMessagesRead(session.id);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };
    
    loadMessages();
  }, [session?.id]);
  
  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Create new session
  const handleCreateSession = useCallback(async () => {
    if (!subject.trim()) return;
    
    try {
      setCreatingSession(true);
      setError(null);
      const response = await customerApi.createOrGetSupportSession(subject.trim());
      setSession(response.session);
      setShowNewSessionModal(false);
      setSubject('');
    } catch (err) {
      setError(err.message || 'Failed to create support session');
    } finally {
      setCreatingSession(false);
    }
  }, [subject]);
  
  // Load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!session?.id || !hasMore || loadingMessages) return;
    
    try {
      setLoadingMessages(true);
      const response = await customerApi.getSupportMessages(session.id, {
        before: cursor?.oldest,
        limit: 50,
      });
      setMessages(prev => [...(response.messages || []), ...prev]);
      setHasMore(response.hasMore);
      setCursor(response.cursor);
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [session?.id, hasMore, loadingMessages, cursor]);
  
  // Send message
  const handleSendMessage = useCallback(async () => {
    if ((!text.trim() && attachments.length === 0) || sending || sessionClosed) return;
    
    try {
      setSending(true);
      const response = await customerApi.sendSupportMessage(
        session.id,
        text.trim() || null,
        attachments
      );
      setMessages(prev => [...prev, response.message]);
      setText('');
      setAttachments([]);
    } catch (err) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [text, attachments, session?.id, sending, sessionClosed]);
  
  // Handle typing
  const handleTyping = useCallback(() => {
    if (!session?.id || sessionClosed) return;
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Send typing start
    customerApi.sendSupportTyping(session.id, true).catch(() => {});
    
    // Set timeout to send typing stop
    typingTimeoutRef.current = setTimeout(() => {
      customerApi.sendSupportTyping(session.id, false).catch(() => {});
    }, 2000);
  }, [session?.id, sessionClosed]);
  
  // Handle file selection
  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    
    for (const file of files) {
      if (attachments.length >= MAX_ATTACHMENTS) {
        setError(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
        break;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Only images (JPEG, PNG, WebP), PDF, and TXT files are allowed');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError('File size must not exceed 5MB');
        continue;
      }
      setAttachments(prev => [...prev, file]);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [attachments.length]);
  
  // Remove attachment
  const removeAttachment = useCallback((index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.createdAt);
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {});
  
  // Session closed view
  if (sessionClosed) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-[#050806]">
        <TopHeader title="Support Chat" showBack={true} onBackClick={handleBackToHelp} />
        <div className="flex flex-col items-center justify-center p-8 text-center h-[calc(100vh-60px)]">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-3xl text-red-600 dark:text-red-400">
              chat_error
            </span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Session Closed
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
            {closeMessage}
          </p>
          <button
            onClick={() => {
              setSessionClosed(false);
              setCloseMessage('');
              setSession(null);
              setMessages([]);
              setShowNewSessionModal(true);
            }}
            className="px-6 py-3 bg-primary text-white rounded-xl font-medium"
          >
            Start New Session
          </button>
        </div>
      </div>
    );
  }
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-[#050806]">
        <TopHeader title="Support Chat" showBack={true} onBackClick={handleBackToHelp} />
        <div className="flex items-center justify-center h-[calc(100vh-60px)]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }
  
  // New session modal
  if (showNewSessionModal) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-[#050806]">
        <TopHeader title="Support Chat" showBack={true} onBackClick={handleBackToHelp} />
        <div className="p-4">
          <div className="bg-white dark:bg-[#111b17] rounded-2xl p-6 shadow-sm">
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="material-symbols-outlined text-3xl text-primary">support_agent</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
              Start Support Chat
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-center text-sm mb-6">
              Describe your issue briefly and our team will assist you.
            </p>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What do you need help with?
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Holdings payment issue, Account verification"
                maxLength={200}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0a120e] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 text-right">
                {subject.length}/200
              </p>
            </div>
            
            <button
              onClick={handleCreateSession}
              disabled={!subject.trim() || creatingSession}
              className="w-full py-3 bg-primary text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {creatingSession ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  Creating...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl">chat</span>
                  Start Chat
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Main chat view
  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806] flex flex-col">
      <TopHeader 
        title="Support Chat" 
        showBack={true} 
        onBackClick={handleBackToHelp}
        subtitle={session?.subject}
      />
      
      {/* Session info */}
      <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <span className="font-medium">Session:</span> {session?.subject}
        </p>
      </div>
      
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Load more button */}
        {hasMore && (
          <button
            onClick={loadMoreMessages}
            disabled={loadingMessages}
            className="w-full py-2 text-primary text-sm font-medium"
          >
            {loadingMessages ? 'Loading...' : 'Load older messages'}
          </button>
        )}
        
        {/* Messages grouped by date */}
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date}>
            <div className="flex items-center justify-center my-4">
              <span className="px-3 py-1 bg-gray-100 dark:bg-[#1a2a24] text-gray-600 dark:text-gray-400 text-xs rounded-full">
                {date}
              </span>
            </div>
            
            {dateMessages.map((message) => (
              <div
                key={message.id}
                className={`flex mb-3 ${message.senderRole === 'customer' ? 'justify-end' : 'justify-start'}`}
              >
                {message.messageType === 'system' ? (
                  <div className="flex items-center justify-center w-full">
                    <span className="px-3 py-1 bg-gray-100 dark:bg-[#1a2a24] text-gray-500 dark:text-gray-400 text-xs rounded-full">
                      {message.text}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.senderRole === 'customer'
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-white dark:bg-[#111b17] text-gray-900 dark:text-white rounded-bl-md border border-gray-100 dark:border-[#22352d]'
                    }`}
                  >
                    {message.senderRole === 'admin' && (
                      <p className="text-xs font-medium text-primary mb-1">{message.senderName}</p>
                    )}
                    
                    {message.text && (
                      <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                    )}
                    
                    {/* Attachments */}
                    {message.attachments?.length > 0 && (
                      <div className={`mt-2 space-y-2 ${message.text ? 'pt-2 border-t border-white/20' : ''}`}>
                        {message.attachments.map((att, idx) => (
                          <a
                            key={idx}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 p-2 rounded-lg ${
                              message.senderRole === 'customer'
                                ? 'bg-white/10 hover:bg-white/20'
                                : 'bg-gray-50 dark:bg-[#0a120e] hover:bg-gray-100 dark:hover:bg-[#152118]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-lg">
                              {getFileIcon(att.mimeType)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{att.originalName}</p>
                              <p className="text-xs opacity-70">{formatFileSize(att.sizeBytes)}</p>
                            </div>
                            <span className="material-symbols-outlined text-sm">download</span>
                          </a>
                        ))}
                      </div>
                    )}
                    
                    <p className={`text-xs mt-1 ${
                      message.senderRole === 'customer' ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {formatTime(message.createdAt)}
                      {message.senderRole === 'customer' && message.readByAdminAt && (
                        <span className="ml-1">✓✓</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        
        {/* Typing indicator */}
        {adminTyping && (
          <div className="flex justify-start mb-3">
            <div className="bg-white dark:bg-[#111b17] rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100 dark:border-[#22352d]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-[#0a120e] border-t border-gray-200 dark:border-[#22352d]">
          <div className="flex gap-2 overflow-x-auto">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="relative flex-shrink-0 w-20 h-20 bg-white dark:bg-[#111b17] rounded-lg border border-gray-200 dark:border-[#22352d] overflow-hidden"
              >
                {file.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-1">
                    <span className="material-symbols-outlined text-2xl text-gray-400">
                      {getFileIcon(file.type)}
                    </span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate w-full text-center">
                      {file.name}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(index)}
                  className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white rounded-bl-lg flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}
      
      {/* Input area */}
      <div className="p-4 bg-white dark:bg-[#111b17] border-t border-gray-200 dark:border-[#22352d]">
        <div className="flex items-end gap-2">
          {/* Attachment button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-primary disabled:opacity-50"
          >
            <span className="material-symbols-outlined">attach_file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                handleTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              maxLength={4000}
              rows={1}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#0a120e] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none max-h-32"
              style={{ minHeight: '48px' }}
            />
          </div>
          
          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={(!text.trim() && attachments.length === 0) || sending}
            className="p-3 bg-primary text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <span className="material-symbols-outlined">send</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupportChat;
