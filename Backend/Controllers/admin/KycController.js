// Controllers/admin/KycController.js
// Admin KYC Management - Review and approve KYC requests

import asyncHandler from 'express-async-handler';
import RegistrationModel from '../../Model/RegistrationModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';

/**
 * @desc     Get all KYC requests
 * @route    GET /api/admin/kyc
 * @access   Private (Admin only)
 */
const getAllKycRequests = asyncHandler(async (req, res) => {
  const { 
    status, 
    search, 
    page = 1, 
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build query
  const query = {};
  
  if (status && status !== 'all') {
    query.status = status;
  }

  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { mobileNumber: { $regex: search, $options: 'i' } },
      { panNumber: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [requests, total] = await Promise.all([
    RegistrationModel.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit)),
    RegistrationModel.countDocuments(query),
  ]);

  const requestsFormatted = requests.map(req => ({
    id: req._id,
    name: `${req.firstName} ${req.middleName || ''} ${req.lastName}`.trim(),
    email: req.email,
    phone: req.mobileNumber,
    whatsapp: req.whatsappNumber,
    panNumber: req.panNumber,
    aadhaarNumber: req.aadhaarNumber ? `****${req.aadhaarNumber.slice(-4)}` : null,
    status: req.status,
    documents: {
      hasAadhaarFront: !!req.documents?.aadhaarFront?.url,
      hasAadhaarBack: !!req.documents?.aadhaarBack?.url,
      hasPanCard: !!req.documents?.panCard?.url,
      hasPassportPhoto: !!req.documents?.passportPhoto?.url,
    },
    submittedAt: req.createdAt,
    reviewedAt: req.reviewedAt,
  }));

  res.status(200).json({
    success: true,
    requests: requestsFormatted,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * @desc     Get KYC request details
 * @route    GET /api/admin/kyc/:id
 * @access   Private (Admin only)
 */
const getKycById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const request = await RegistrationModel.findById(id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'KYC request not found.',
    });
  }

  res.status(200).json({
    success: true,
    request: {
      id: request._id,
      personal: {
        firstName: request.firstName,
        middleName: request.middleName,
        lastName: request.lastName,
        email: request.email,
        mobileNumber: request.mobileNumber,
        whatsappNumber: request.whatsappNumber,
      },
      identity: {
        nameAsPerAadhaar: request.nameAsPerAadhaar,
        aadhaarNumber: request.aadhaarNumber,
        panNumber: request.panNumber,
      },
      address: {
        permanent: request.permanentAddress,
      },
      documents: {
        aadhaarFront: request.documents?.aadhaarFront || null,
        aadhaarBack: request.documents?.aadhaarBack || null,
        panCard: request.documents?.panCard || null,
        passportPhoto: request.documents?.passportPhoto || null,
      },
      status: request.status,
      reviewNotes: request.reviewNotes,
      reviewedBy: request.reviewedBy,
      reviewedAt: request.reviewedAt,
      submittedAt: request.createdAt,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    },
  });
});

/**
 * @desc     Approve KYC request
 * @route    POST /api/admin/kyc/:id/approve
 * @access   Private (Admin only)
 */
const approveKyc = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes, createCustomer = false, brokerId } = req.body;
  const adminId = req.user._id;

  const request = await RegistrationModel.findById(id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'KYC request not found.',
    });
  }

  if (request.status === 'approved') {
    return res.status(400).json({
      success: false,
      message: 'KYC request is already approved.',
    });
  }

  // Update request status
  request.status = 'approved';
  request.reviewNotes = notes || 'Approved by admin';
  request.reviewedBy = adminId;
  request.reviewedAt = new Date();
  await request.save();

  let customer = null;

  // Optionally create customer account
  if (createCustomer) {
    // Check if customer already exists
    const existingCustomer = await CustomerModel.findOne({
      $or: [
        ...(request.email ? [{ email: request.email.toLowerCase() }] : []),
        ...(request.phone ? [{ phone: request.phone }] : []),
        ...(request.mobileNumber ? [{ phone: request.mobileNumber }] : []),
        ...(request.userId ? [{ customer_id: request.userId }] : []),
      ]
    });

    if (existingCustomer) {
      // Update existing customer KYC status
      existingCustomer.kyc_status = 'verified';
      existingCustomer.kyc_verified_at = new Date();
      existingCustomer.pan_number = request.panNumber;
      await existingCustomer.save();
      customer = existingCustomer;
    } else {
      // Create new customer
      const BrokerModel = await import('../../Model/Auth/BrokerModel.js').then(m => m.default);
      let brokerObject = null;
      
      if (brokerId) {
        brokerObject = await BrokerModel.findOne({ broker_id: brokerId });
      }

      if (!brokerObject) {
        return res.status(400).json({
          success: false,
          message: 'Valid brokerId is required to create a customer.',
        });
      }

      const customerName = (request.name || `${request.firstName || ''} ${request.lastName || ''}`.trim()).trim() || 'Customer';
      const customerEmail = request.email ? request.email.toLowerCase() : '';
      const customerPhone = request.phone || request.mobileNumber || '';
      const customerId = request.userId || request.phone || request.mobileNumber || request.email;
      const customerPassword = request.password || request.mobileNumber?.slice(-6) || '123456';

      customer = await CustomerModel.create({
        customer_id: customerId,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        password: customerPassword,
        pan_number: request.panNumber,
        kyc_status: 'verified',
        kyc_verified_at: new Date(),
        kyc_request_id: request._id,
        status: 'active',
        trading_enabled: true,
        broker_id: brokerObject._id,
        broker_id_str: brokerObject.broker_id,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: 'KYC request approved.',
    request: {
      id: request._id,
      status: request.status,
    },
    customer: customer ? {
      id: customer.customer_id,
      name: customer.name,
    } : null,
  });
});

/**
 * @desc     Reject KYC request
 * @route    POST /api/admin/kyc/:id/reject
 * @access   Private (Admin only)
 */
const rejectKyc = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason, notes } = req.body;
  const adminId = req.user._id;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason is required.',
    });
  }

  const request = await RegistrationModel.findById(id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'KYC request not found.',
    });
  }

  if (request.status === 'rejected') {
    return res.status(400).json({
      success: false,
      message: 'KYC request is already rejected.',
    });
  }

  request.status = 'rejected';
  request.rejectionReason = reason;
  request.reviewNotes = notes || reason;
  request.reviewedBy = adminId;
  request.reviewedAt = new Date();
  await request.save();

  res.status(200).json({
    success: true,
    message: 'KYC request rejected.',
    request: {
      id: request._id,
      status: request.status,
      reason: reason,
    },
  });
});

/**
 * @desc     Get KYC statistics
 * @route    GET /api/admin/kyc/stats
 * @access   Private (Admin only)
 */
const getKycStats = asyncHandler(async (req, res) => {
  const stats = await RegistrationModel.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  };

  stats.forEach((s) => {
    result[s._id] = s.count;
    result.total += s.count;
  });

  // Get recent trends
  const last7Days = new Date();
  last7Days.setDate(last7Days.getDate() - 7);

  const recentStats = await RegistrationModel.aggregate([
    { $match: { createdAt: { $gte: last7Days } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    stats: result,
    trends: {
      last7Days: recentStats,
    },
  });
});

export {
  getAllKycRequests,
  getKycById,
  approveKyc,
  rejectKyc,
  getKycStats,
};
