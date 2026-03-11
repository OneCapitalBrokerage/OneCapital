import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import adminApi from '../../api/admin';
import { useAdminAuth } from '../../context/AdminContext';

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

const formatRelativeTime = (date) => {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
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

const Chats = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { admin } = useAdminAuth();
  
  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHasUnread, setFilterHasUnread] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  
  // Active session state
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  
  // Input state
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [customerTyping, setCustomerTyping] = useState(false);
  
  // Modal state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closing, setClosing] = useState(false);
  
  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const activeSessionIdRef = useRef(null);
  
  // Keep activeSessionIdRef in sync with activeSession state
  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id || null;
  }, [activeSession?.id]);
  
  // Socket connection - only connect once when admin is available
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token || !admin) return;
    
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
    const baseUrl = apiUrl.replace(/\/api\/?$/, '');
    
    const socket = io(`${baseUrl}/market`, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      console.log('[Admin Support] Socket connected');
    });
    
    // New session created
    socket.on('support:session_new', (data) => {
      setSessions(prev => [data.session, ...prev]);
      setTotalUnread(prev => prev + 1);
      
      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Support Chat', {
          body: `${data.session.customerName}: ${data.session.subject}`,
          icon: '/favicon.ico',
        });
      }
    });
    
    // Message received
    socket.on('support:message', (data) => {
      // Use ref to get current session ID
      const currentSessionId = activeSessionIdRef.current;
      if (data.session_id === currentSessionId) {
        setMessages(prev => [...prev, data.message]);
        // Mark as read
        adminApi.markSupportMessagesRead(data.session_id, [data.message.id]).catch(() => {});
      }
      // Update session in list
      setSessions(prev => prev.map(s => {
        if (s.id === data.session_id) {
          return {
            ...s,
            lastMessageAt: data.message.createdAt,
            lastMessagePreview: data.message.text || '[Attachment]',
            lastMessageSender: data.message.senderRole,
            adminUnreadCount: data.session_id === currentSessionId ? 0 : s.adminUnreadCount + 1,
          };
        }
        return s;
      }));
    });
    
    // Typing status
    socket.on('support:typing', (data) => {
      if (data.session_id === activeSessionIdRef.current && data.role === 'customer') {
        setCustomerTyping(data.is_typing);
      }
    });
    
    // Session update
    socket.on('support:session_update', (data) => {
      setSessions(prev => prev.map(s => 
        s.id === data.session?.id ? data.session : s
      ));
      if (data.session?.id === activeSessionIdRef.current) {
        setActiveSession(data.session);
      }
    });
    
    // Session deleted
    socket.on('support:session_deleted', (data) => {
      setSessions(prev => prev.filter(s => s.id !== data.session_id));
      if (data.session_id === activeSessionIdRef.current) {
        setActiveSession(null);
        setMessages([]);
        navigate('/admin/chats');
      }
    });
    
    return () => {
      socket.disconnect();
    };
  }, [admin, navigate]);
  
  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
  
  // Load sessions
  const fetchSessions = useCallback(async () => {
    try {
      setLoadingSessions(true);
      const response = await adminApi.getSupportSessions({
        search: searchQuery,
        hasUnread: filterHasUnread ? 'true' : undefined,
        limit: 50,
        sortBy: 'last_message_at',
        sortOrder: 'desc',
      });
      setSessions(response.sessions || []);
      setTotalUnread(response.totalUnread || 0);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, [searchQuery, filterHasUnread]);
  
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);
  
  // Load active session from URL
  useEffect(() => {
    if (sessionId) {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        setActiveSession(session);
      } else if (!loadingSessions) {
        // Try to fetch the session
        adminApi.getSupportSession(sessionId)
          .then(res => setActiveSession(res.session))
          .catch(() => navigate('/admin/chats'));
      }
    } else {
      setActiveSession(null);
      setMessages([]);
    }
  }, [sessionId, sessions, loadingSessions, navigate]);
  
  // Load messages when active session changes
  useEffect(() => {
    if (!activeSession?.id) return;
    
    const loadMessages = async () => {
      try {
        setLoadingMessages(true);
        const response = await adminApi.getSupportMessages(activeSession.id, { limit: 50 });
        setMessages(response.messages || []);
        setHasMore(response.hasMore);
        setCursor(response.cursor);
        
        // Mark all as read
        if (response.messages?.length > 0) {
          await adminApi.markSupportMessagesRead(activeSession.id);
          // Update local state
          setSessions(prev => prev.map(s => 
            s.id === activeSession.id ? { ...s, adminUnreadCount: 0 } : s
          ));
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };
    
    loadMessages();
  }, [activeSession?.id]);
  
  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Load more messages
  const loadMoreMessages = useCallback(async () => {
    if (!activeSession?.id || !hasMore || loadingMessages) return;
    
    try {
      setLoadingMessages(true);
      const response = await adminApi.getSupportMessages(activeSession.id, {
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
  }, [activeSession?.id, hasMore, loadingMessages, cursor]);
  
  // Send message
  const handleSendMessage = useCallback(async () => {
    if ((!text.trim() && attachments.length === 0) || sending || !activeSession?.id) return;
    
    try {
      setSending(true);
      const response = await adminApi.sendSupportMessage(
        activeSession.id,
        text.trim() || null,
        attachments
      );
      setMessages(prev => [...prev, response.message]);
      setText('');
      setAttachments([]);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  }, [text, attachments, activeSession?.id, sending]);
  
  // Handle typing
  const handleTyping = useCallback(() => {
    if (!activeSession?.id) return;
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    adminApi.sendSupportTyping(activeSession.id, true).catch(() => {});
    
    typingTimeoutRef.current = setTimeout(() => {
      adminApi.sendSupportTyping(activeSession.id, false).catch(() => {});
    }, 2000);
  }, [activeSession?.id]);
  
  // Handle file selection
  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    
    for (const file of files) {
      if (attachments.length >= MAX_ATTACHMENTS) break;
      if (!ALLOWED_TYPES.includes(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;
      setAttachments(prev => [...prev, file]);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachments.length]);
  
  // Remove attachment
  const removeAttachment = useCallback((index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  // Resolve session
  const handleResolve = useCallback(async () => {
    if (!activeSession?.id) return;
    
    try {
      setClosing(true);
      await adminApi.resolveSupportSession(activeSession.id);
      setSessions(prev => prev.filter(s => s.id !== activeSession.id));
      setActiveSession(null);
      setMessages([]);
      navigate('/admin/chats');
    } catch (err) {
      console.error('Failed to resolve session:', err);
    } finally {
      setClosing(false);
    }
  }, [activeSession?.id, navigate]);
  
  // Close session
  const handleClose = useCallback(async () => {
    if (!activeSession?.id) return;
    
    try {
      setClosing(true);
      await adminApi.closeSupportSession(activeSession.id, closeReason);
      setSessions(prev => prev.filter(s => s.id !== activeSession.id));
      setActiveSession(null);
      setMessages([]);
      setShowCloseModal(false);
      setCloseReason('');
      navigate('/admin/chats');
    } catch (err) {
      console.error('Failed to close session:', err);
    } finally {
      setClosing(false);
    }
  }, [activeSession?.id, closeReason, navigate]);
  
  // Open session
  const openSession = (session) => {
    navigate(`/admin/chats/${session.id}`);
  };
  
  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.createdAt);
    if (!groups[date]) groups[date] = [];
    groups[date].push(message);
    return groups;
  }, {});
  
  return (
    <div className={`relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden ${!activeSession ? 'pb-16 sm:pb-20' : ''}`}>
      {/* Close Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 mx-4 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-2">Close Session</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will close the session and notify the customer.
            </p>
            <textarea
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder="Reason for closing (optional)"
              className="w-full p-3 border border-gray-200 rounded-xl mb-4 resize-none"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium disabled:opacity-50"
              >
                {closing ? 'Closing...' : 'Close Session'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => activeSession ? navigate('/admin/chats') : navigate('/admin/dashboard')}
              className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">
                {activeSession ? activeSession.customerName : 'Support Chats'}
              </h1>
              <p className="text-[10px] sm:text-xs text-gray-500 font-medium">
                {activeSession 
                  ? activeSession.subject 
                  : `${totalUnread} unread`}
              </p>
            </div>
          </div>
          
          {activeSession && (
            <div className="flex gap-2">
              <button
                onClick={handleResolve}
                disabled={closing}
                className="px-3 py-1.5 text-xs font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
              >
                Resolve
              </button>
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={closing}
                className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
              >
                Close
              </button>
            </div>
          )}
        </div>
        
        {/* Search - only in list view */}
        {!activeSession && (
          <>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
              </span>
              <input
                type="text"
                placeholder="Search by customer, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 sm:h-10 rounded-lg border border-gray-200 pl-9 sm:pl-10 pr-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none transition-all"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setFilterHasUnread(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  !filterHasUnread 
                    ? 'bg-[#137fec] text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterHasUnread(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filterHasUnread 
                    ? 'bg-[#137fec] text-white' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Unread ({totalUnread})
              </button>
            </div>
          </>
        )}
      </header>
      
      {/* Content */}
      {!activeSession ? (
        // Sessions List
        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-[#137fec] border-t-transparent rounded-full" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <span className="material-symbols-outlined text-5xl text-gray-300 mb-4">chat</span>
              <p className="text-gray-500 text-center">No support sessions</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => openSession(session)}
                  className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-[#137fec]">
                      {session.customerName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="font-semibold text-sm truncate">
                        {session.customerName}
                      </p>
                      <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                        {formatRelativeTime(session.lastMessageAt)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mb-1">
                      {session.subject}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400 truncate">
                        {session.lastMessageSender === 'admin' && '✓ '}
                        {session.lastMessagePreview}
                      </p>
                      {session.adminUnreadCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-[#137fec] text-white rounded-full">
                          {session.adminUnreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Chat View
        <>
          {/* Session info */}
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs">
            <span className="font-medium text-blue-700">Customer ID:</span>{' '}
            <span className="text-blue-600">{activeSession.customerId}</span>
            <span className="mx-2 text-blue-300">|</span>
            <span className="font-medium text-blue-700">Broker:</span>{' '}
            <span className="text-blue-600">{activeSession.brokerId}</span>
          </div>
          
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Load more button */}
            {hasMore && (
              <button
                onClick={loadMoreMessages}
                disabled={loadingMessages}
                className="w-full py-2 text-[#137fec] text-sm font-medium"
              >
                {loadingMessages ? 'Loading...' : 'Load older messages'}
              </button>
            )}
            
            {/* Messages grouped by date */}
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-4">
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {date}
                  </span>
                </div>
                
                {dateMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex mb-3 ${message.senderRole === 'admin' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.messageType === 'system' ? (
                      <div className="flex items-center justify-center w-full">
                        <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                          {message.text}
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          message.senderRole === 'admin'
                            ? 'bg-[#137fec] text-white rounded-br-md'
                            : 'bg-white text-gray-900 rounded-bl-md border border-gray-200'
                        }`}
                      >
                        {message.senderRole === 'customer' && (
                          <p className="text-xs font-medium text-[#137fec] mb-1">
                            {message.senderName}
                          </p>
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
                                  message.senderRole === 'admin'
                                    ? 'bg-white/10 hover:bg-white/20'
                                    : 'bg-gray-50 hover:bg-gray-100'
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
                          message.senderRole === 'admin' ? 'text-white/70' : 'text-gray-500'
                        }`}>
                          {formatTime(message.createdAt)}
                          {message.senderRole === 'admin' && message.readByCustomerAt && (
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
            {customerTyping && (
              <div className="flex justify-start mb-3">
                <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200">
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
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
              <div className="flex gap-2 overflow-x-auto">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="relative flex-shrink-0 w-16 h-16 bg-white rounded-lg border border-gray-200 overflow-hidden"
                  >
                    {file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-xl text-gray-400">
                          {getFileIcon(file.type)}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removeAttachment(index)}
                      className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white rounded-bl-lg flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Input area */}
          <div className="p-3 bg-white border-t border-gray-200">
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                className="p-2 text-gray-500 hover:text-[#137fec] disabled:opacity-50"
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
              
              <div className="flex-1">
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
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]/20 focus:border-[#137fec] resize-none max-h-24"
                  style={{ minHeight: '40px' }}
                />
              </div>
              
              <button
                onClick={handleSendMessage}
                disabled={(!text.trim() && attachments.length === 0) || sending}
                className="p-2.5 bg-[#137fec] text-white rounded-xl disabled:opacity-50"
              >
                {sending ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <span className="material-symbols-outlined">send</span>
                )}
              </button>
            </div>
          </div>
        </>
      )}
      
      {/* Bottom Navigation - only show in list view */}
      {!activeSession && (
        <nav className="fixed bottom-0 w-full max-w-md mx-auto bg-white border-t border-gray-200 z-30">
          <div className="flex justify-around items-center h-14 sm:h-16">
            <button onClick={() => navigate('/admin/dashboard')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">dashboard</span>
              <span className="text-[10px] font-medium">Dashboard</span>
            </button>
            <button onClick={() => navigate('/admin/customers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">group</span>
              <span className="text-[10px] font-medium">Customers</span>
            </button>
            <button onClick={() => navigate('/admin/brokers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">corporate_fare</span>
              <span className="text-[10px] font-medium">Brokers</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-[#137fec]">
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chat</span>
              <span className="text-[10px] font-medium">Chats</span>
            </button>
            <button onClick={() => navigate('/admin/settings')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
              <span className="material-symbols-outlined text-[20px] sm:text-[24px]">settings</span>
              <span className="text-[10px] font-medium">Settings</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
};

export default Chats;
