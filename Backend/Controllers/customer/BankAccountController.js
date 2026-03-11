import BankAccount from '../../Model/Auth/BankAccountModel.js';
import CustomerKYC from '../../Model/KYC/CustomerKYCModel.js';

/**
 * Get all bank accounts for the logged-in customer
 * @route GET /api/customer/bank-accounts
 */
export const getBankAccounts = async (req, res) => {
  try {
    const accounts = await BankAccount.find({
      customer_id: req.user._id,
      is_active: true
    }).sort({ is_primary: -1, createdAt: -1 });

    res.json({ success: true, accounts });
  } catch (error) {
    console.error('getBankAccounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bank accounts' });
  }
};

/**
 * Add a new bank account
 * @route POST /api/customer/bank-accounts
 */
export const addBankAccount = async (req, res) => {
  try {
    const { bank_name, account_number, ifsc_code, account_holder_name, account_type } = req.body;

    if (!bank_name || !account_number || !ifsc_code || !account_holder_name) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check for duplicate account number
    const existing = await BankAccount.findOne({
      customer_id: req.user._id,
      account_number,
      is_active: true
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This account is already linked' });
    }

    // Check if this is the first account (make it primary)
    const existingCount = await BankAccount.countDocuments({
      customer_id: req.user._id,
      is_active: true
    });

    const masked = account_number.length > 4
      ? '****' + account_number.slice(-4)
      : account_number;

    const account = await BankAccount.create({
      customer_id: req.user._id,
      customer_id_str: String(req.user._id),
      bank_name,
      account_number,
      account_number_masked: masked,
      ifsc_code: ifsc_code.toUpperCase(),
      account_holder_name,
      account_type: account_type || 'savings',
      is_primary: existingCount === 0,
    });

    // Reset bank_proof KYC so user must re-verify with new bank details
    const kyc = await CustomerKYC.findOne({ customer_id: req.user._id });
    if (kyc && kyc.bank_proof?.status === 'approved') {
      kyc.bank_proof.status = 'not_submitted';
      kyc.bank_proof.document = { url: null, public_id: null, uploaded_at: null };
      kyc.bank_proof.submitted_at = null;
      kyc.bank_proof.reviewed_at = null;
      kyc.bank_proof.rejection_reason = null;
      kyc.recalculateOverallStatus();
      await kyc.save();
    }

    res.status(201).json({ success: true, account });
  } catch (error) {
    console.error('addBankAccount error:', error);
    res.status(500).json({ success: false, message: 'Failed to add bank account' });
  }
};

/**
 * Update a bank account and reset bank_proof KYC for re-verification
 * @route PUT /api/customer/bank-accounts/:id
 */
export const updateBankAccount = async (req, res) => {
  try {
    const { bank_name, account_number, ifsc_code, account_holder_name, account_type } = req.body;

    if (!bank_name || !account_number || !ifsc_code || !account_holder_name) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const account = await BankAccount.findOne({
      _id: req.params.id,
      customer_id: req.user._id,
      is_active: true
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    // Check for duplicate if account number changed
    if (account_number !== account.account_number) {
      const duplicate = await BankAccount.findOne({
        customer_id: req.user._id,
        account_number,
        is_active: true,
        _id: { $ne: account._id }
      });
      if (duplicate) {
        return res.status(400).json({ success: false, message: 'This account number is already linked' });
      }
    }

    const masked = account_number.length > 4
      ? '****' + account_number.slice(-4)
      : account_number;

    account.bank_name = bank_name;
    account.account_number = account_number;
    account.account_number_masked = masked;
    account.ifsc_code = ifsc_code.toUpperCase();
    account.account_holder_name = account_holder_name;
    if (account_type) account.account_type = account_type;

    await account.save();

    // Reset bank_proof KYC so user must re-verify with updated bank details
    const kyc = await CustomerKYC.findOne({ customer_id: req.user._id });
    if (kyc && kyc.bank_proof) {
      kyc.bank_proof.status = 'not_submitted';
      kyc.bank_proof.document = { url: null, public_id: null, uploaded_at: null };
      kyc.bank_proof.submitted_at = null;
      kyc.bank_proof.reviewed_at = null;
      kyc.bank_proof.rejection_reason = null;
      kyc.recalculateOverallStatus();
      await kyc.save();
    }

    res.json({ success: true, account, message: 'Bank account updated. Please re-submit bank proof for verification.' });
  } catch (error) {
    console.error('updateBankAccount error:', error);
    res.status(500).json({ success: false, message: 'Failed to update bank account' });
  }
};

/**
 * Delete (deactivate) a bank account
 * @route DELETE /api/customer/bank-accounts/:id
 */
export const deleteBankAccount = async (req, res) => {
  try {
    const account = await BankAccount.findOne({
      _id: req.params.id,
      customer_id: req.user._id,
      is_active: true
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    account.is_active = false;
    await account.save();

    res.json({ success: true, message: 'Bank account removed' });
  } catch (error) {
    console.error('deleteBankAccount error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove bank account' });
  }
};
