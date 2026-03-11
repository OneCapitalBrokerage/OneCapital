import CustomerKYC from '../../Model/KYC/CustomerKYCModel.js';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Helper: get or create KYC record for a customer
 */
const getOrCreateKyc = async (customerId) => {
  let kyc = await CustomerKYC.findOne({ customer_id: customerId });
  if (!kyc) {
    kyc = await CustomerKYC.create({
      customer_id: customerId,
      customer_id_str: String(customerId),
    });
  }
  return kyc;
};

/**
 * Mask aadhaar number: 1234 5678 9012 → ********9012
 */
const maskAadhaar = (num) => {
  if (!num) return null;
  const clean = num.replace(/\s/g, '');
  return clean.length >= 4 ? '********' + clean.slice(-4) : num;
};

/**
 * @route GET /api/customer/kyc-documents
 * @desc  Get KYC document status for logged-in customer
 */
export const getKycDocuments = async (req, res) => {
  try {
    const kyc = await getOrCreateKyc(req.user._id);

    res.json({
      success: true,
      kyc: {
        aadhaar: {
          number: maskAadhaar(kyc.aadhaar?.number_full),
          front: kyc.aadhaar?.front?.url || null,
          back: kyc.aadhaar?.back?.url || null,
          status: kyc.aadhaar?.status || 'not_submitted',
          rejection_reason: kyc.aadhaar?.rejection_reason || null,
        },
        pan: {
          number: kyc.pan?.number || null,
          front: kyc.pan?.front?.url || null,
          back: kyc.pan?.back?.url || null,
          signature: kyc.pan?.signature?.url || null,
          status: kyc.pan?.status || 'not_submitted',
          rejection_reason: kyc.pan?.rejection_reason || null,
        },
        bank_proof: {
          document: kyc.bank_proof?.document?.url || null,
          status: kyc.bank_proof?.status || 'not_submitted',
          rejection_reason: kyc.bank_proof?.rejection_reason || null,
        },
        overall_status: kyc.overall_status,
      },
    });
  } catch (error) {
    console.error('getKycDocuments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch KYC documents' });
  }
};

/**
 * @route POST /api/customer/kyc-documents/aadhaar
 * @desc  Submit Aadhaar card details
 * @body  { number, front_url, front_public_id, back_url, back_public_id }
 */
export const submitAadhaar = async (req, res) => {
  try {
    const { number, front_url, front_public_id, back_url, back_public_id } = req.body;

    if (!number || !front_url || !back_url) {
      return res.status(400).json({ success: false, message: 'Aadhaar number, front and back photos are required' });
    }

    const clean = number.replace(/\s/g, '');
    if (clean.length !== 12 || !/^\d{12}$/.test(clean)) {
      return res.status(400).json({ success: false, message: 'Aadhaar number must be 12 digits' });
    }

    const kyc = await getOrCreateKyc(req.user._id);

    if (kyc.aadhaar?.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Aadhaar is already approved and cannot be modified' });
    }

    kyc.aadhaar = {
      number: maskAadhaar(clean),
      number_full: clean,
      front: { url: front_url, public_id: front_public_id || null, uploaded_at: new Date() },
      back: { url: back_url, public_id: back_public_id || null, uploaded_at: new Date() },
      status: 'pending',
      submitted_at: new Date(),
      reviewed_at: null,
      rejection_reason: null,
    };

    kyc.recalculateOverallStatus();
    await kyc.save();

    res.json({ success: true, message: 'Aadhaar submitted for verification', status: 'pending' });
  } catch (error) {
    console.error('submitAadhaar error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit Aadhaar' });
  }
};

/**
 * @route POST /api/customer/kyc-documents/pan
 * @desc  Submit PAN card details
 * @body  { number, front_url, front_public_id, back_url, back_public_id, signature_url, signature_public_id }
 */
export const submitPan = async (req, res) => {
  try {
    const { number, front_url, front_public_id, back_url, back_public_id, signature_url, signature_public_id } = req.body;

    if (!number || !front_url || !back_url || !signature_url) {
      return res.status(400).json({ success: false, message: 'PAN number, front, back photos and signature are required' });
    }

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(number.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Invalid PAN number format (e.g. ABCDE1234F)' });
    }

    const kyc = await getOrCreateKyc(req.user._id);

    if (kyc.pan?.status === 'approved') {
      return res.status(400).json({ success: false, message: 'PAN is already approved and cannot be modified' });
    }

    kyc.pan = {
      number: number.toUpperCase(),
      front: { url: front_url, public_id: front_public_id || null, uploaded_at: new Date() },
      back: { url: back_url, public_id: back_public_id || null, uploaded_at: new Date() },
      signature: { url: signature_url, public_id: signature_public_id || null, uploaded_at: new Date() },
      status: 'pending',
      submitted_at: new Date(),
      reviewed_at: null,
      rejection_reason: null,
    };

    kyc.recalculateOverallStatus();
    await kyc.save();

    res.json({ success: true, message: 'PAN submitted for verification', status: 'pending' });
  } catch (error) {
    console.error('submitPan error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit PAN' });
  }
};

/**
 * @route POST /api/customer/kyc-documents/bank-proof
 * @desc  Submit bank passbook/cancelled cheque
 * @body  { document_url, document_public_id }
 */
export const submitBankProof = async (req, res) => {
  try {
    const { document_url, document_public_id } = req.body;

    if (!document_url) {
      return res.status(400).json({ success: false, message: 'Bank passbook or cancelled cheque photo is required' });
    }

    const kyc = await getOrCreateKyc(req.user._id);

    if (kyc.bank_proof?.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Bank proof is already approved and cannot be modified' });
    }

    kyc.bank_proof = {
      document: { url: document_url, public_id: document_public_id || null, uploaded_at: new Date() },
      status: 'pending',
      submitted_at: new Date(),
      reviewed_at: null,
      rejection_reason: null,
    };

    kyc.recalculateOverallStatus();
    await kyc.save();

    res.json({ success: true, message: 'Bank proof submitted for verification', status: 'pending' });
  } catch (error) {
    console.error('submitBankProof error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit bank proof' });
  }
};

/**
 * @route GET /api/customer/kyc-documents/upload-signature
 * @desc  Get Cloudinary signature for direct browser upload
 */
export const getUploadSignature = async (req, res) => {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'kyc_documents';

    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET || ''
    );

    res.json({
      success: true,
      signature,
      timestamp,
      folder,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  } catch (error) {
    console.error('getUploadSignature error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate upload signature' });
  }
};
