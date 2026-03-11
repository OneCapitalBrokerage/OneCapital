// Controllers/broker/VerifyCodeController.js
// Public endpoint — lets prospective customers validate a broker reference code OR broker_id

import asyncHandler from 'express-async-handler';
import BrokerModel from '../../Model/Auth/BrokerModel.js';

/**
 * @desc    Verify a broker code — accepts either reference_code or broker_id
 * @route   GET /api/broker/verify-code?code=WOLF0001
 * @access  Public
 *
 * The `code` param is matched against both:
 *   - reference_code (e.g. "WOLF0001") — the short shareable code
 *   - broker_id (e.g. "BRK0000000001") — the permanent system ID
 * Either works.
 */
const verifyBrokerCode = asyncHandler(async (req, res) => {
  const { code } = req.query;

  if (!code || !String(code).trim()) {
    return res.status(400).json({ valid: false, message: 'Code is required.' });
  }

  const normalizedCode = String(code).toUpperCase().trim();

  const broker = await BrokerModel.findOne(
    {
      $or: [
        { reference_code: normalizedCode, status: 'active' },
        { broker_id: normalizedCode, status: 'active' },
      ],
    },
    'broker_id name company_name address.city reference_code status'
  );

  if (!broker) {
    return res.status(200).json({ valid: false, message: 'Invalid or inactive broker code.' });
  }

  return res.status(200).json({
    valid: true,
    broker_id: broker.broker_id,
    broker_name: broker.company_name || broker.name,
    city: broker.address?.city || '',
    reference_code: broker.reference_code,
  });
});

export { verifyBrokerCode };
