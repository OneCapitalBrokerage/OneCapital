// Controllers/customer/SupportController.js
// Customer Support Chat - Create sessions, send messages, manage read status

import asyncHandler from 'express-async-handler';
import { v2 as cloudinary } from 'cloudinary';
import SupportSessionModel from '../../Model/Support/SupportSessionModel.js';
import SupportMessageModel from '../../Model/Support/SupportMessageModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import { upload as cloudinaryUpload, remove as cloudinaryRemove } from '../../services/storage/adapters/cloudinaryAdapter.js';

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
const MAX_SUBJECT_LENGTH = 200;

/**
 * @desc     Create a new support session or get existing one
 * @route    POST /api/customer/support/sessions
 * @access   Private (Customer only)
 */
const createOrGetSession = asyncHandler(async (req, res) => {
  const customerId = req.user.id;
  const { subject } = req.body;

  // Get customer details
  const customer = await CustomerModel.findById(customerId).select('customer_id name broker_id broker_id_str');
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // Check for existing open session
  let session = await SupportSessionModel.findOne({
    customer_id: customerId,
    status: 'open',
  });

  if (session) {
    // Return existing session
    return res.status(200).json({
      success: true,
      message: 'Existing session found',
      session: formatSession(session),
      isNew: false,
    });
  }

  // Validate subject for new session
  if (!subject || subject.trim().length === 0) {
    res.status(400);
    throw new Error('Subject is required to create a new support session');
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    res.status(400);
    throw new Error(`Subject must not exceed ${MAX_SUBJECT_LENGTH} characters`);
  }

  // Create new session
  session = await SupportSessionModel.create({
    customer_id: customerId,
    customer_id_str: customer.customer_id,
    customer_name: customer.name,
    broker_id: customer.broker_id,
    broker_id_str: customer.broker_id_str,
    subject: subject.trim(),
    created_by_role: 'customer',
    last_message_preview: `New session: ${subject.trim().substring(0, 50)}`,
    last_message_sender: 'customer',
  });

  // Create system message for session creation
  await SupportMessageModel.create({
    session_id: session.session_id,
    session_ref: session._id,
    sender_role: 'system',
    sender_name: 'System',
    message_type: 'system',
    text: `Support session created with subject: ${subject.trim()}`,
    system_event: 'session_created',
    read_by_customer_at: new Date(),
  });

  // Emit socket event for admin notification
  const io = req.app.get('io');
  if (io) {
    io.to('support:admin').emit('support:session_new', {
      session: formatSession(session),
    });
  }

  res.status(201).json({
    success: true,
    message: 'Support session created',
    session: formatSession(session),
    isNew: true,
  });
});

/**
 * @desc     Get current active support session
 * @route    GET /api/customer/support/sessions/current
 * @access   Private (Customer only)
 */
const getCurrentSession = asyncHandler(async (req, res) => {
  const customerId = req.user.id;

  const session = await SupportSessionModel.findOne({
    customer_id: customerId,
    status: 'open',
  });

  if (!session) {
    return res.status(200).json({
      success: true,
      session: null,
      message: 'No active support session',
    });
  }

  res.status(200).json({
    success: true,
    session: formatSession(session),
  });
});

/**
 * @desc     Get messages for a session (cursor-based pagination)
 * @route    GET /api/customer/support/sessions/:sessionId/messages
 * @access   Private (Customer only)
 */
const getMessages = asyncHandler(async (req, res) => {
  const customerId = req.user.id;
  const { sessionId } = req.params;
  const { before, after, limit = 50 } = req.query;

  // Verify session belongs to customer
  const session = await SupportSessionModel.findOne({
    session_id: sessionId,
    customer_id: customerId,
  });

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
 * @route    POST /api/customer/support/sessions/:sessionId/messages
 * @access   Private (Customer only)
 */
const sendMessage = asyncHandler(async (req, res) => {
  const customerId = req.user.id;
  const { sessionId } = req.params;
  const { text } = req.body;

  // Get customer details
  const customer = await CustomerModel.findById(customerId).select('customer_id name');
  if (!customer) {
    res.status(404);
    throw new Error('Customer not found');
  }

  // Verify session belongs to customer and is open
  const session = await SupportSessionModel.findOne({
    session_id: sessionId,
    customer_id: customerId,
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
        uploaded_by_role: 'customer',
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
    sender_role: 'customer',
    sender_id: customerId,
    sender_model: 'Customer',
    sender_name: customer.name,
    message_type: messageType,
    text: hasText ? text.trim() : null,
    attachments,
    read_by_customer_at: new Date(),
  });

  // Update session's last message info
  const preview = hasText 
    ? text.trim().substring(0, 100) 
    : `[${attachments.length} attachment${attachments.length > 1 ? 's' : ''}]`;

  await SupportSessionModel.findByIdAndUpdate(session._id, {
    last_message_at: new Date(),
    last_message_preview: preview,
    last_message_sender: 'customer',
    $inc: { admin_unread_count: 1 },
  });

  // Emit socket events
  const io = req.app.get('io');
  console.log('[Support] Customer sendMessage - io available:', !!io, 'session_id:', sessionId);
  if (io) {
    // Notify admin of new message
    console.log('[Support] Emitting to room: support:admin');
    io.to('support:admin').emit('support:message', {
      session_id: sessionId,
      message: formatMessage(message),
    });
    
    // Update session in admin list
    const updatedSession = await SupportSessionModel.findById(session._id);
    io.to('support:admin').emit('support:session_update', {
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
 * @route    POST /api/customer/support/sessions/:sessionId/read
 * @access   Private (Customer only)
 */
const markRead = asyncHandler(async (req, res) => {
  const customerId = req.user.id;
  const { sessionId } = req.params;
  const { messageIds } = req.body;

  // Verify session belongs to customer
  const session = await SupportSessionModel.findOne({
    session_id: sessionId,
    customer_id: customerId,
  });

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  // Mark messages as read by customer
  const now = new Date();
  if (messageIds && messageIds.length > 0) {
    await SupportMessageModel.updateMany(
      {
        session_id: sessionId,
        _id: { $in: messageIds },
        read_by_customer_at: null,
      },
      { read_by_customer_at: now }
    );
  } else {
    // Mark all unread messages as read
    await SupportMessageModel.updateMany(
      {
        session_id: sessionId,
        read_by_customer_at: null,
      },
      { read_by_customer_at: now }
    );
  }

  // Reset customer unread count
  await SupportSessionModel.findByIdAndUpdate(session._id, {
    customer_unread_count: 0,
  });

  // Emit socket event for read status
  const io = req.app.get('io');
  if (io) {
    io.to('support:admin').emit('support:read', {
      session_id: sessionId,
      read_by: 'customer',
      read_at: now,
    });
  }

  res.status(200).json({
    success: true,
    message: 'Messages marked as read',
  });
});

/**
 * @desc     Emit typing status
 * @route    POST /api/customer/support/sessions/:sessionId/typing
 * @access   Private (Customer only)
 */
const sendTyping = asyncHandler(async (req, res) => {
  const customerId = req.user.id;
  const { sessionId } = req.params;
  const { isTyping } = req.body;

  // Verify session belongs to customer
  const session = await SupportSessionModel.findOne({
    session_id: sessionId,
    customer_id: customerId,
    status: 'open',
  });

  if (!session) {
    res.status(404);
    throw new Error('Session not found or already closed');
  }

  // Emit typing status via socket
  const io = req.app.get('io');
  if (io) {
    io.to('support:admin').emit('support:typing', {
      session_id: sessionId,
      is_typing: isTyping,
      role: 'customer',
    });
  }

  res.status(200).json({ success: true });
});

// Helper: Format session for API response
const formatSession = (session) => ({
  id: session.session_id,
  _id: session._id,
  customerId: session.customer_id_str,
  customerName: session.customer_name,
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
    mimeType: att.mime_type,
    originalName: att.original_name,
    sizeBytes: att.size_bytes,
  })) || [],
  systemEvent: message.system_event,
  readByCustomerAt: message.read_by_customer_at,
  readByAdminAt: message.read_by_admin_at,
  createdAt: message.createdAt,
});

export {
  createOrGetSession,
  getCurrentSession,
  getMessages,
  sendMessage,
  markRead,
  sendTyping,
};
