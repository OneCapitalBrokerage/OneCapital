// Controllers/broker/KycController.js
// Broker KYC Approval - Review and approve/reject customer KYC documents

import asyncHandler from 'express-async-handler';
import CustomerKYC from '../../Model/KYC/CustomerKYCModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';

const getBrokerCustomerIds = async (brokerIdStr) => {
  const brokerCustomers = await CustomerModel.find({ broker_id_str: brokerIdStr })
    .select('_id')
    .lean();
  return brokerCustomers.map((customer) => customer._id);
};

const ensureBrokerOwnership = async (kyc, brokerIdStr) => {
  if (!kyc?.customer_id) return null;
  const customer = await CustomerModel.findById(kyc.customer_id)
    .select('name email phone customer_id broker_id_str')
    .lean();
  if (!customer || customer.broker_id_str !== brokerIdStr) return null;
  return customer;
};

/**
 * @desc     Get pending KYC document submissions from customers
 * @route    GET /api/broker/kyc
 * @access   Private (Broker only)
 */
const getKycRequests = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { status = 'pending', page = 1, limit = 20 } = req.query;
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const customerIds = await getBrokerCustomerIds(brokerIdStr);
  if (customerIds.length === 0) {
    return res.status(200).json({
      success: true,
      requests: [],
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: 0,
        pages: 0,
      },
    });
  }

  // Build query: find CustomerKYC docs where at least one document has the target status
  const query = { customer_id: { $in: customerIds } };
  if (status && status !== 'all') {
    query.$or = [
      { 'aadhaar.status': status },
      { 'pan.status': status },
      { 'bank_proof.status': status },
    ];
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [kycDocs, total] = await Promise.all([
    CustomerKYC.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    CustomerKYC.countDocuments(query),
  ]);

  // Fetch customer info for each KYC doc
  const requestCustomerIds = kycDocs.map((k) => k.customer_id);
  const customers = await CustomerModel.find({ _id: { $in: requestCustomerIds } })
    .select('name email phone customer_id broker_id_str')
    .lean();

  const customerMap = {};
  customers.forEach(c => {
    customerMap[String(c._id)] = c;
  });

  const requests = kycDocs.map((kyc) => {
    const cust = customerMap[String(kyc.customer_id)];
    return {
      id: kyc._id,
      customerId: cust?.customer_id || kyc.customer_id_str,
      customerName: cust?.name || 'Unknown',
      email: cust?.email || '',
      phone: cust?.phone || '',
      overall_status: kyc.overall_status,
      aadhaar: {
        number: kyc.aadhaar?.number || null,
        status: kyc.aadhaar?.status || 'not_submitted',
        submitted_at: kyc.aadhaar?.submitted_at,
        rejection_reason: kyc.aadhaar?.rejection_reason,
      },
      pan: {
        number: kyc.pan?.number || null,
        status: kyc.pan?.status || 'not_submitted',
        submitted_at: kyc.pan?.submitted_at,
        rejection_reason: kyc.pan?.rejection_reason,
      },
      bank_proof: {
        status: kyc.bank_proof?.status || 'not_submitted',
        submitted_at: kyc.bank_proof?.submitted_at,
        rejection_reason: kyc.bank_proof?.rejection_reason,
      },
      updatedAt: kyc.updatedAt,
    };
  });

  res.status(200).json({
    success: true,
    requests,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages: Math.ceil(total / parsedLimit),
    },
  });
});

/**
 * @desc     Get full KYC details for a customer (with images)
 * @route    GET /api/broker/kyc/:id
 * @access   Private (Broker only)
 */
const getKycDetail = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  const kyc = await CustomerKYC.findById(id).lean();
  if (!kyc) {
    return res.status(404).json({ success: false, message: 'KYC record not found.' });
  }

  const customer = await ensureBrokerOwnership(kyc, brokerIdStr);
  if (!customer) {
    return res.status(404).json({ success: false, message: 'KYC record not found.' });
  }

  res.status(200).json({
    success: true,
    kyc: {
      id: kyc._id,
      customerId: customer?.customer_id || kyc.customer_id_str,
      customerName: customer?.name || 'Unknown',
      email: customer?.email || '',
      phone: customer?.phone || '',
      overall_status: kyc.overall_status,
      aadhaar: {
        number: kyc.aadhaar?.number || null,
        front_url: kyc.aadhaar?.front?.url || null,
        back_url: kyc.aadhaar?.back?.url || null,
        status: kyc.aadhaar?.status || 'not_submitted',
        submitted_at: kyc.aadhaar?.submitted_at,
        reviewed_at: kyc.aadhaar?.reviewed_at,
        rejection_reason: kyc.aadhaar?.rejection_reason,
      },
      pan: {
        number: kyc.pan?.number || null,
        front_url: kyc.pan?.front?.url || null,
        back_url: kyc.pan?.back?.url || null,
        signature_url: kyc.pan?.signature?.url || null,
        status: kyc.pan?.status || 'not_submitted',
        submitted_at: kyc.pan?.submitted_at,
        reviewed_at: kyc.pan?.reviewed_at,
        rejection_reason: kyc.pan?.rejection_reason,
      },
      bank_proof: {
        document_url: kyc.bank_proof?.document?.url || null,
        status: kyc.bank_proof?.status || 'not_submitted',
        submitted_at: kyc.bank_proof?.submitted_at,
        reviewed_at: kyc.bank_proof?.reviewed_at,
        rejection_reason: kyc.bank_proof?.rejection_reason,
      },
    },
  });
});

/**
 * @desc     Approve a specific KYC document (aadhaar, pan, or bank_proof)
 * @route    POST /api/broker/kyc/:id/approve
 * @access   Private (Broker only)
 * @body     { document: 'aadhaar' | 'pan' | 'bank_proof' }
 */
const approveKyc = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { document: docType } = req.body;

  const validDocs = ['aadhaar', 'pan', 'bank_proof'];
  if (!docType || !validDocs.includes(docType)) {
    return res.status(400).json({
      success: false,
      message: `document must be one of: ${validDocs.join(', ')}`,
    });
  }

  const kyc = await CustomerKYC.findById(id);
  if (!kyc) {
    return res.status(404).json({ success: false, message: 'KYC record not found.' });
  }
  if (!(await ensureBrokerOwnership(kyc, brokerIdStr))) {
    return res.status(404).json({ success: false, message: 'KYC record not found.' });
  }

  if (!kyc[docType] || kyc[docType].status === 'not_submitted') {
    return res.status(400).json({ success: false, message: `${docType} has not been submitted yet.` });
  }

  if (kyc[docType].status === 'approved') {
    return res.status(400).json({ success: false, message: `${docType} is already approved.` });
  }

  kyc[docType].status = 'approved';
  kyc[docType].reviewed_at = new Date();
  kyc[docType].rejection_reason = null;
  kyc.recalculateOverallStatus();
  await kyc.save();

  // If all approved, update customer KYC status
  if (kyc.overall_status === 'approved') {
    await CustomerModel.findByIdAndUpdate(kyc.customer_id, {
      kyc_status: 'verified',
      kyc_verified_at: new Date(),
    });
  }

  res.status(200).json({
    success: true,
    message: `${docType} approved successfully.`,
    overall_status: kyc.overall_status,
  });
});

/**
 * @desc     Reject a specific KYC document
 * @route    POST /api/broker/kyc/:id/reject
 * @access   Private (Broker only)
 * @body     { document: 'aadhaar' | 'pan' | 'bank_proof', reason: string }
 */
const rejectKyc = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;
  const { document: docType, reason } = req.body;

  const validDocs = ['aadhaar', 'pan', 'bank_proof'];
  if (!docType || !validDocs.includes(docType)) {
    return res.status(400).json({
      success: false,
      message: `document must be one of: ${validDocs.join(', ')}`,
    });
  }

  if (!reason) {
    return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
  }

  const kyc = await CustomerKYC.findById(id);
  if (!kyc) {
    return res.status(404).json({ success: false, message: 'KYC record not found.' });
  }
  if (!(await ensureBrokerOwnership(kyc, brokerIdStr))) {
    return res.status(404).json({ success: false, message: 'KYC record not found.' });
  }

  if (!kyc[docType] || kyc[docType].status === 'not_submitted') {
    return res.status(400).json({ success: false, message: `${docType} has not been submitted yet.` });
  }

  kyc[docType].status = 'rejected';
  kyc[docType].reviewed_at = new Date();
  kyc[docType].rejection_reason = reason;
  kyc.recalculateOverallStatus();
  await kyc.save();

  res.status(200).json({
    success: true,
    message: `${docType} rejected.`,
    overall_status: kyc.overall_status,
  });
});

/**
 * @desc     Get KYC statistics
 * @route    GET /api/broker/kyc/stats
 * @access   Private (Broker only)
 */
const getKycStats = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;

  // Get all customers for this broker
  const brokerCustomers = await CustomerModel.find({ broker_id_str: brokerIdStr })
    .select('_id')
    .lean();
  const customerIds = brokerCustomers.map(c => c._id);

  const stats = await CustomerKYC.aggregate([
    { $match: { customer_id: { $in: customerIds } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: {
          $sum: {
            $cond: [
              { $or: [
                { $eq: ['$aadhaar.status', 'pending'] },
                { $eq: ['$pan.status', 'pending'] },
                { $eq: ['$bank_proof.status', 'pending'] },
              ]},
              1, 0
            ]
          }
        },
        approved: {
          $sum: { $cond: [{ $eq: ['$overall_status', 'approved'] }, 1, 0] }
        },
        rejected: {
          $sum: { $cond: [{ $eq: ['$overall_status', 'rejected'] }, 1, 0] }
        },
      },
    },
  ]);

  const result = stats[0] || { total: 0, pending: 0, approved: 0, rejected: 0 };

  res.status(200).json({
    success: true,
    stats: {
      pending: result.pending,
      approved: result.approved,
      rejected: result.rejected,
      total: result.total,
    },
  });
});

export {
  getKycRequests,
  getKycDetail,
  approveKyc,
  rejectKyc,
  getKycStats,
};
