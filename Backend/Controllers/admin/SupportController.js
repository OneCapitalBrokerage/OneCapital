// Controllers/admin/SupportController.js
// Admin Support Chat - View sessions, send messages, resolve/close sessions

import asyncHandler from 'express-async-handler';
import SupportSessionModel from '../../Model/Support/SupportSessionModel.js';
import SupportMessageModel from '../../Model/Support/SupportMessageModel.js';
import AdminModel from '../../Model/Auth/AdminModel.js';
import { remove as cloudinaryRemove } from '../../services/storage/adapters/cloudinaryAdapter.js';
import { upload as cloudinaryUpload } from '../../services/storage/adapters/cloudinaryAdapter.js';

// Allowed MIME types for attachments
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_TEXT_LENGTH = 4000;

/**
 * @desc     Get all support sessions with filtering and pagination
 * @route    GET /api/admin/support/sessions
 * @access   Private (Admin only)
 */
const getAllSessions = asyncHandler(async (req, res) => {
  const {
    status,
    brokerId,
    search,
    hasUnread,
    page = 1,
    limit = 20,
    sortBy = 'last_message_at',
    sortOrder = 'desc',
  } = req.query;

  const query = {};

  // Status filter
  if (status && status !== 'all') {
    query.status = status;
  }

  // Broker filter
  if (brokerId) {
    query.broker_id_str = brokerId;
  }

  // Has unread messages filter
  if (hasUnread === 'true') {
    query.admin_unread_count = { $gt: 0 };
  }

  // Search by customer name or ID
  if (search) {
    query.$or = [
      { customer_name: { $regex: search, $options: 'i' } },
      { customer_id_str: { $regex: search, $options: 'i' } },
      { subject: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [sessions, total, totalUnread] = await Promise.all([
    SupportSessionModel.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit)),
    SupportSessionModel.countDocuments(query),
    SupportSessionModel.countDocuments({ ...query, admin_unread_count: { $gt: 0 } }),
  ]);

  res.status(200).json({
    success: true,
    sessions: sessions.map(formatSession),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
    totalUnread,
  });
});

/**
 * @desc     Get a specific support session
 * @route    GET /api/admin/support/sessions/:sessionId
 * @access   Private (Admin only)
 */
const getSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const session = await SupportSessionModel.findOne({ session_id: sessionId });

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  res.status(200).json({
    success: true,
    session: formatSession(session),
  });
});

/**
 * @desc     Get messages for a session (cursor-based pagination)
 * @route    GET /api/admin/support/sessions/:sessionId/messages
 * @access   Private (Admin only)
 */
const getMessages = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { before, after, limit = 50 } = req.query;

  // Verify session exists
  const session = await SupportSessionModel.findOne({ session_id: sessionId });

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  // Build query with cursor-based pagination
  const query = { session_id: sessionId };
  
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  } else if (after) {
    query.createdAt = { $gt: new Date(after) };
  }

  const messages = await SupportMessageModel.find(query)
    .sort({ createdAt: before ? -1 : 1 })
    .limit(parseInt(limit) + 1);

  // Determine if there are more messages
  const hasMore = messages.length > parseInt(limit);
  if (hasMore) messages.pop();

  // Reverse if fetching older messages
  if (before) messages.reverse();

  res.status(200).json({
    success: true,
    messages: messages.map(formatMessage),
    hasMore,
    cursor: messages.length > 0 ? {
      oldest: messages[0]?.createdAt,
      newest: messages[messages.length - 1]?.createdAt,
    } : null,
  });
});

/**
 * @desc     Send a message in a session
 * @route    POST /api/admin/support/sessions/:sessionId/messages
 * @access   Private (Admin only)
 */
const sendMessage = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const { sessionId } = req.params;
  const { text } = req.body;

  // Get admin details
  const admin = await AdminModel.findById(adminId).select('admin_id name');
  if (!admin) {
    res.status(404);
    throw new Error('Admin not found');
  }

  // Verify session exists and is open
  const session = await SupportSessionModel.findOne({
    session_id: sessionId,
    status: 'open',
  });

  if (!session) {
    res.status(404);
    throw new Error('Session not found or already closed');
  }

  // Handle attachments if present (from multer middleware)
  const attachments = [];
  if (req.files && req.files.length > 0) {
    if (req.files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      res.status(400);
      throw new Error(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments allowed per message`);
    }

    for (const file of req.files) {
      // Validate MIME type
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        res.status(400);
        throw new Error(`File type ${file.mimetype} is not allowed. Allowed types: JPEG, PNG, WebP, PDF, TXT`);
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        res.status(400);
        throw new Error(`File ${file.originalname} exceeds maximum size of 5MB`);
      }

      // Upload to Cloudinary
      const filename = `support_${sessionId}_${Date.now()}_${file.originalname}`;
      const uploadResult = await cloudinaryUpload(file.buffer, filename, 'support-attachments');

      if (!uploadResult.success) {
        res.status(500);
        throw new Error(`Failed to upload attachment: ${uploadResult.error}`);
      }

      attachments.push({
        url: uploadResult.url,
        public_id: uploadResult.publicId,
        resource_type: uploadResult.format === 'pdf' ? 'raw' : 'image',
        mime_type: file.mimetype,
        original_name: file.originalname,
        size_bytes: file.size,
        uploaded_by_role: 'admin',
      });
    }
  }

  // Validate message content
  const hasText = text && text.trim().length > 0;
  const hasAttachments = attachments.length > 0;

  if (!hasText && !hasAttachments) {
    res.status(400);
    throw new Error('Message must have text or attachments');
  }

  if (hasText && text.length > MAX_TEXT_LENGTH) {
    res.status(400);
    throw new Error(`Message text must not exceed ${MAX_TEXT_LENGTH} characters`);
  }

  // Determine message type
  let messageType = 'text';
  if (hasText && hasAttachments) messageType = 'mixed';
  else if (hasAttachments) messageType = 'attachment';

  // Create message
  const message = await SupportMessageModel.create({
    session_id: sessionId,
    session_ref: session._id,
    sender_role: 'admin',
    sender_id: adminId,
    sender_model: 'Admin',
    sender_name: admin.name || 'Admin',
    message_type: messageType,
    text: hasText ? text.trim() : null,
    attachments,
    read_by_admin_at: new Date(),
  });

  // Update session's last message info
  const preview = hasText 
    ? text.trim().substring(0, 100) 
    : `[${attachments.length} attachment${attachments.length > 1 ? 's' : ''}]`;

  await SupportSessionModel.findByIdAndUpdate(session._id, {
    last_message_at: new Date(),
    last_message_preview: preview,
    last_message_sender: 'admin',
    $inc: { customer_unread_count: 1 },
  });

  // Emit socket events
  const io = req.app.get('io');
  console.log('[Support] Admin sendMessage - io available:', !!io, 'customer_id_str:', session.customer_id_str);
  if (io) {
    // Notify customer of new message
    const customerRoom = `support:customer:${session.customer_id_str}`;
    console.log('[Support] Emitting to room:', customerRoom);
    io.to(customerRoom).emit('support:message', {
      session_id: sessionId,
      message: formatMessage(message),
    });
    
    // Also update session for customer
    const updatedSession = await SupportSessionModel.findById(session._id);
    io.to(customerRoom).emit('support:session_update', {
      session: formatSession(updatedSession),
    });
  }

  res.status(201).json({
    success: true,
    message: formatMessage(message),
  });
});

/**
 * @desc     Mark messages as read
 * @route    POST /api/admin/support/sessions/:sessionId/read
 * @access   Private (Admin only)
 */
const markRead = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { messageIds } = req.body;

  // Verify session exists
  const session = await SupportSessionModel.findOne({ session_id: sessionId });

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  // Mark messages as read by admin
  const now = new Date();
  if (messageIds && messageIds.length > 0) {
    await SupportMessageModel.updateMany(
      {
        session_id: sessionId,
        _id: { $in: messageIds },
        read_by_admin_at: null,
      },
      { read_by_admin_at: now }
    );
  } else {
    // Mark all unread messages as read
    await SupportMessageModel.updateMany(
      {
        session_id: sessionId,
        read_by_admin_at: null,
      },
      { read_by_admin_at: now }
    );
  }

  // Reset admin unread count
  await SupportSessionModel.findByIdAndUpdate(session._id, {
    admin_unread_count: 0,
  });

  // Emit socket event for read status
  const io = req.app.get('io');
  if (io) {
    io.to(`support:customer:${session.customer_id_str}`).emit('support:read', {
      session_id: sessionId,
      read_by: 'admin',
      read_at: now,
    });
  }

  res.status(200).json({
    success: true,
    message: 'Messages marked as read',
  });
});

/**
 * @desc     Resolve and delete a support session
 * @route    POST /api/admin/support/sessions/:sessionId/resolve
 * @access   Private (Admin only)
 */
const resolveSession = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const { sessionId } = req.params;

  const session = await SupportSessionModel.findOne({ session_id: sessionId });

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  // Get admin details
  const admin = await AdminModel.findById(adminId).select('name');

  // Create final system message before deletion
  await SupportMessageModel.create({
    session_id: sessionId,
    session_ref: session._id,
    sender_role: 'system',
    sender_name: 'System',
    message_type: 'system',
    text: `Session resolved by ${admin?.name || 'Admin'}`,
    system_event: 'session_resolved',
  });

  // Emit session closed event to customer BEFORE deletion
  const io = req.app.get('io');
  if (io) {
    io.to(`support:customer:${session.customer_id_str}`).emit('support:session_closed', {
      session_id: sessionId,
      reason: 'resolved',
      message: 'Your support session has been resolved. Thank you for contacting us.',
    });
  }

  // Delete all attachments from Cloudinary
  const messages = await SupportMessageModel.find({ session_id: sessionId });
  for (const message of messages) {
    for (const attachment of message.attachments || []) {
      if (attachment.public_id) {
        await cloudinaryRemove(attachment.public_id);
      }
    }
  }

  // Delete all messages
  await SupportMessageModel.deleteMany({ session_id: sessionId });

  // Delete the session
  await SupportSessionModel.findByIdAndDelete(session._id);

  // Notify admin panel of session removal
  if (io) {
    io.to('support:admin').emit('support:session_deleted', {
      session_id: sessionId,
    });
  }

  res.status(200).json({
    success: true,
    message: 'Session resolved and deleted',
  });
});

/**
 * @desc     Close and delete a support session (without resolution)
 * @route    POST /api/admin/support/sessions/:sessionId/close
 * @access   Private (Admin only)
 */
const closeSession = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const { sessionId } = req.params;
  const { reason } = req.body;

  const session = await SupportSessionModel.findOne({ session_id: sessionId });

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  // Get admin details
  const admin = await AdminModel.findById(adminId).select('name');

  // Create final system message before deletion
  await SupportMessageModel.create({
    session_id: sessionId,
    session_ref: session._id,
    sender_role: 'system',
    sender_name: 'System',
    message_type: 'system',
    text: reason 
      ? `Session closed by ${admin?.name || 'Admin'}: ${reason}` 
      : `Session closed by ${admin?.name || 'Admin'}`,
    system_event: 'session_closed',
  });

  // Emit session closed event to customer BEFORE deletion
  const io = req.app.get('io');
  if (io) {
    io.to(`support:customer:${session.customer_id_str}`).emit('support:session_closed', {
      session_id: sessionId,
      reason: 'closed',
      message: reason || 'Your support session has been closed by admin.',
    });
  }

  // Delete all attachments from Cloudinary
  const messages = await SupportMessageModel.find({ session_id: sessionId });
  for (const message of messages) {
    for (const attachment of message.attachments || []) {
      if (attachment.public_id) {
        await cloudinaryRemove(attachment.public_id);
      }
    }
  }

  // Delete all messages
  await SupportMessageModel.deleteMany({ session_id: sessionId });

  // Delete the session
  await SupportSessionModel.findByIdAndDelete(session._id);

  // Notify admin panel of session removal
  if (io) {
    io.to('support:admin').emit('support:session_deleted', {
      session_id: sessionId,
    });
  }

  res.status(200).json({
    success: true,
    message: 'Session closed and deleted',
  });
});

/**
 * @desc     Emit typing status
 * @route    POST /api/admin/support/sessions/:sessionId/typing
 * @access   Private (Admin only)
 */
const sendTyping = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { isTyping } = req.body;

  // Verify session exists and is open
  const session = await SupportSessionModel.findOne({
    session_id: sessionId,
    status: 'open',
  });

  if (!session) {
    res.status(404);
    throw new Error('Session not found or already closed');
  }

  // Emit typing status via socket
  const io = req.app.get('io');
  if (io) {
    io.to(`support:customer:${session.customer_id_str}`).emit('support:typing', {
      session_id: sessionId,
      is_typing: isTyping,
      role: 'admin',
    });
  }

  res.status(200).json({ success: true });
});

/**
 * @desc     Get total unread count across all sessions
 * @route    GET /api/admin/support/unread-count
 * @access   Private (Admin only)
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const result = await SupportSessionModel.aggregate([
    { $match: { status: 'open' } },
    { $group: { _id: null, total: { $sum: '$admin_unread_count' } } },
  ]);

  const totalUnread = result[0]?.total || 0;

  res.status(200).json({
    success: true,
    unreadCount: totalUnread,
  });
});

// Helper: Format session for API response
const formatSession = (session) => ({
  id: session.session_id,
  _id: session._id,
  customerId: session.customer_id_str,
  customerName: session.customer_name,
  customerMongoId: session.customer_id,
  brokerId: session.broker_id_str,
  subject: session.subject,
  status: session.status,
  lastMessageAt: session.last_message_at,
  lastMessagePreview: session.last_message_preview,
  lastMessageSender: session.last_message_sender,
  customerUnreadCount: session.customer_unread_count,
  adminUnreadCount: session.admin_unread_count,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

// Helper: Format message for API response
const formatMessage = (message) => ({
  id: message._id,
  sessionId: message.session_id,
  senderRole: message.sender_role,
  senderName: message.sender_name,
  messageType: message.message_type,
  text: message.text,
  attachments: message.attachments?.map(att => ({
    url: att.url,
    publicId: att.public_id,
    mimeType: att.mime_type,
    originalName: att.original_name,
    sizeBytes: att.size_bytes,
    uploadedByRole: att.uploaded_by_role,
  })) || [],
  systemEvent: message.system_event,
  readByCustomerAt: message.read_by_customer_at,
  readByAdminAt: message.read_by_admin_at,
  createdAt: message.createdAt,
});

export {
  getAllSessions,
  getSession,
  getMessages,
  sendMessage,
  markRead,
  resolveSession,
  closeSession,
  sendTyping,
  getUnreadCount,
};
