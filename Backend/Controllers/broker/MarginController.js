// Controllers/broker/MarginController.js
// Broker Margin Management - Update client margin limits

import asyncHandler from 'express-async-handler';
import FundModel from '../../Model/FundManagement/FundModel.js';
import CustomerModel from '../../Model/Auth/CustomerModel.js';
import { writeAuditSuccess } from '../../Utils/AuditLogger.js';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (value) =>
  toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatPercent = (value) => `${toNumber(value).toFixed(2)}%`;

const getBrokerOwnershipClauses = (brokerId, brokerIdStr) => {
  const clauses = [{ broker_id: brokerId }, { attached_broker_id: brokerId }];
  if (brokerIdStr) {
    clauses.push({ broker_id_str: brokerIdStr });
  }
  return clauses;
};

/**
 * @desc     Update client margin
 * @route    POST /api/broker/margin/update
 * @access   Private (Broker only)
 */
const updateClientMargin = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { 
    customerId, 
    intradayLimit, 
    overnightLimit,
    optionLimitPercentage 
  } = req.body;

  if (!customerId) {
    return res.status(400).json({
      success: false,
      message: 'Customer ID is required.',
    });
  }

  // Verify customer belongs to broker
  const customer = await CustomerModel.findOne({
    customer_id: customerId,
    $or: getBrokerOwnershipClauses(brokerId, brokerIdStr),
  });

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  // Find fund record
  let fund = await FundModel.findOne({
    customer_id_str: customerId,
    broker_id_str: brokerIdStr
  });

  if (!fund) {
    fund = await FundModel.create({
      customer_id: customer._id,
      customer_id_str: customerId,
      broker_id_str: brokerIdStr,
      net_available_balance: 0,
      available_balance: 0,
      withdrawable_balance: 0,
      intraday: { available_limit: 0, used_limit: 0, available: 0, used: 0 },
      overnight: { available_limit: 0, used_limit: 0 },
      delivery: { available: 0, used: 0, available_limit: 0, used_limit: 0 },
      option_limit_percentage: 10,
      commodity_delivery: { available_limit: 0, used_limit: 0 },
      commodity_option: { limit_percentage: 10, used: 0 },
    });
  }

  const updates = {};
  const updateFlags = {
    intraday: false,
    overnight: false,
    optionLimit: false,
  };
  const beforeMargin = {
    intraday: {
      available: Number(fund.intraday?.available_limit || 0),
      used: Number(fund.intraday?.used_limit || 0),
    },
    overnight: {
      available: Number(fund.overnight?.available_limit || 0),
    },
    optionLimitPercentage: Number(fund.option_limit_percentage || 10),
  };

  // Update intraday limit
  if (intradayLimit !== undefined) {
    fund.intraday.available_limit = Number(intradayLimit);
    updates.intradayLimit = Number(intradayLimit);
    updateFlags.intraday = true;
  }

  // Update overnight limit
  if (overnightLimit !== undefined) {
    fund.overnight.available_limit = Number(overnightLimit);
    updates.overnightLimit = Number(overnightLimit);
    updateFlags.overnight = true;
  }

  // Update option limit percentage
  if (optionLimitPercentage !== undefined) {
    fund.option_limit_percentage = Number(optionLimitPercentage);
    updates.optionLimitPercentage = Number(optionLimitPercentage);
    updateFlags.optionLimit = true;
  }

  await fund.save();
  const afterMargin = {
    intraday: {
      available: Number(fund.intraday?.available_limit || 0),
      used: Number(fund.intraday?.used_limit || 0),
    },
    overnight: {
      available: Number(fund.overnight?.available_limit || 0),
    },
    optionLimitPercentage: Number(fund.option_limit_percentage || 10),
  };

  if (updateFlags.intraday || updateFlags.overnight) {
    const limitChanges = [];
    const updatedFields = [];
    if (updateFlags.intraday) {
      limitChanges.push(
        `Intraday available changed from ${formatCurrency(beforeMargin.intraday.available)} to ${formatCurrency(afterMargin.intraday.available)}.`
      );
      updatedFields.push('intraday limit');
    }
    if (updateFlags.overnight) {
      limitChanges.push(
        `Overnight available changed from ${formatCurrency(beforeMargin.overnight.available)} to ${formatCurrency(afterMargin.overnight.available)}.`
      );
      updatedFields.push('overnight limit');
    }

    await writeAuditSuccess({
      req,
      type: 'transaction',
      eventType: 'MARGIN_LIMIT_UPDATE',
      category: 'margin',
      message: `Broker updated margin limits for customer ${customer.customer_id}. ${limitChanges.join(' ')}`,
      target: {
        type: 'customer',
        id: customer._id,
        id_str: customer.customer_id,
      },
      entity: {
        type: 'fund',
        id: fund._id,
        ref: customer.customer_id,
      },
      broker: {
        broker_id: brokerId,
        broker_id_str: brokerIdStr,
      },
      customer: {
        customer_id: customer._id,
        customer_id_str: customer.customer_id,
      },
      marginBefore: beforeMargin,
      marginAfter: afterMargin,
      note: `Updated fields: ${updatedFields.join(', ')}.`,
      metadata: { updates, updatedFields },
    });
  }

  if (updateFlags.optionLimit) {
    await writeAuditSuccess({
      req,
      type: 'transaction',
      eventType: 'OPTION_LIMIT_PERCENT_UPDATE',
      category: 'margin',
      message: `Broker updated option limit percentage for customer ${customer.customer_id} from ${formatPercent(beforeMargin.optionLimitPercentage)} to ${formatPercent(afterMargin.optionLimitPercentage)}.`,
      target: {
        type: 'customer',
        id: customer._id,
        id_str: customer.customer_id,
      },
      entity: {
        type: 'fund',
        id: fund._id,
        ref: customer.customer_id,
      },
      broker: {
        broker_id: brokerId,
        broker_id_str: brokerIdStr,
      },
      customer: {
        customer_id: customer._id,
        customer_id_str: customer.customer_id,
      },
      marginBefore: {
        optionLimitPercentage: beforeMargin.optionLimitPercentage,
      },
      marginAfter: {
        optionLimitPercentage: afterMargin.optionLimitPercentage,
      },
      note: 'Manual option limit update recorded.',
      metadata: {
        beforeOptionLimitPercentage: beforeMargin.optionLimitPercentage,
        afterOptionLimitPercentage: afterMargin.optionLimitPercentage,
      },
    });
  }

  console.log(`[Broker] Updated margin for client ${customerId}:`, updates);

  res.status(200).json({
    success: true,
    message: 'Margin updated successfully.',
    data: {
      customerId,
      updates,
      currentLimits: {
        intraday: {
          available: fund.intraday.available_limit,
          used: fund.intraday.used_limit,
        },
        overnight: {
          available: fund.overnight.available_limit,
        },
        optionLimitPercentage: fund.option_limit_percentage,
      },
    },
  });
});

/**
 * @desc     Get client margin details
 * @route    GET /api/broker/clients/:id/margin
 * @access   Private (Broker only)
 */
const getClientMargin = asyncHandler(async (req, res) => {
  const brokerId = req.user._id;
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { id } = req.params;

  // Verify customer belongs to broker
  const customer = await CustomerModel.findOne({
    customer_id: id,
    $or: getBrokerOwnershipClauses(brokerId, brokerIdStr),
  });

  if (!customer) {
    return res.status(404).json({
      success: false,
      message: 'Client not found.',
    });
  }

  // Get fund record
  const fund = await FundModel.findOne({
    customer_id_str: id,
    broker_id_str: brokerIdStr
  });

  if (!fund) {
    return res.status(200).json({
      success: true,
      data: {
        customerId: id,
        customerName: customer.name,
        margin: {
          intraday: { available: 0, used: 0, free: 0, utilization: 0 },
          overnight: { available: 0 },
          optionLimitPercentage: 10,
        },
      },
    });
  }

  const intradayAvailable = fund.intraday?.available_limit || 0;
  const intradayUsed = fund.intraday?.used_limit || 0;
  const intradayFree = intradayAvailable - intradayUsed;
  const utilization = intradayAvailable > 0 
    ? Math.round((intradayUsed / intradayAvailable) * 100) 
    : 0;

  res.status(200).json({
    success: true,
    data: {
      customerId: id,
      customerName: customer.name,
      margin: {
        intraday: {
          available: intradayAvailable,
          used: intradayUsed,
          free: intradayFree,
          utilization,
        },
        overnight: {
          available: fund.overnight?.available_limit || 0,
        },
        optionLimitPercentage: fund.option_limit_percentage || 10,
      },
    },
  });
});

/**
 * @desc     Get margin update history
 * @route    GET /api/broker/margin/history
 * @access   Private (Broker only)
 */
const getMarginHistory = asyncHandler(async (req, res) => {
  const brokerIdStr = req.user.login_id || req.user.stringBrokerId;
  const { customerId, page = 1, limit = 20 } = req.query;

  // Build query
  const query = { broker_id_str: brokerIdStr };
  if (customerId) {
    query.customer_id_str = customerId;
  }

  // Get all funds for this broker
  const funds = await FundModel.find(query)
    .select('customer_id_str intraday overnight option_limit_percentage updatedAt');

  // Get customer names
  const customerIds = funds.map(f => f.customer_id_str);
  const customers = await CustomerModel.find({
    customer_id: { $in: customerIds }
  }).select('customer_id name');

  const customerMap = {};
  customers.forEach(c => {
    customerMap[c.customer_id] = c.name;
  });

  // Format margin records
  const marginRecords = funds.map(fund => ({
    customerId: fund.customer_id_str,
    customerName: customerMap[fund.customer_id_str] || 'Unknown',
    intraday: fund.intraday?.available_limit || 0,
    overnight: fund.overnight?.available_limit || 0,
    optionLimit: fund.option_limit_percentage || 10,
    lastUpdated: fund.updatedAt,
  }));

  // Paginate
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const paginatedRecords = marginRecords.slice(skip, skip + parseInt(limit));

  res.status(200).json({
    success: true,
    records: paginatedRecords,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: marginRecords.length,
      pages: Math.ceil(marginRecords.length / parseInt(limit)),
    },
  });
});

export {
  updateClientMargin,
  getClientMargin,
  getMarginHistory,
};
