// Controllers/admin/KiteController.js
// Admin-only Kite utilities

import asyncHandler from 'express-async-handler';
import { authenticator } from 'otplib';
import KiteCredential from '../../Model/KiteCredentialModel.js';
import { decrypt } from '../../services/AutoLoginService.js';

const TOTP_PERIOD_SECONDS = 30;

const buildErrorResponse = (res, status, code, error) => (
  res.status(status).json({
    success: false,
    code,
    error,
  })
);

const normalizeSecret = (secret) => String(secret || '').replace(/\s+/g, '').toUpperCase();

const getValidityWindow = (now = Date.now()) => {
  const validForSeconds = TOTP_PERIOD_SECONDS - Math.floor((now / 1000) % TOTP_PERIOD_SECONDS);
  return {
    generatedAt: new Date(now),
    expiresAt: new Date(now + (validForSeconds * 1000)),
    validForSeconds,
  };
};

/**
 * @desc     Generate TOTP from active Kite credential
 * @route    POST /api/admin/kite/totp/generate
 * @access   Private (Admin only)
 */
export const generateKiteTOTP = asyncHandler(async (_req, res) => {
  const credential = await KiteCredential.findOne({ is_active: true }).lean();

  if (!credential) {
    return buildErrorResponse(
      res,
      404,
      'NO_ACTIVE_KITE_CREDENTIAL',
      'No active Kite credential found.'
    );
  }

  if (!credential.totp_secret) {
    return buildErrorResponse(
      res,
      404,
      'TOTP_NOT_CONFIGURED',
      'Active Kite credential does not have a TOTP secret configured.'
    );
  }

  const decryptedSecret = decrypt(credential.totp_secret);

  if (!decryptedSecret) {
    return buildErrorResponse(
      res,
      422,
      'TOTP_SECRET_DECRYPT_FAILED',
      'Stored TOTP secret could not be decrypted.'
    );
  }

  const cleanSecret = normalizeSecret(decryptedSecret);

  if (!cleanSecret) {
    return buildErrorResponse(
      res,
      422,
      'TOTP_SECRET_INVALID',
      'Stored TOTP secret is empty or invalid.'
    );
  }

  try {
    const otp = authenticator.generate(cleanSecret);
    const { generatedAt, expiresAt, validForSeconds } = getValidityWindow();

    return res.status(200).json({
      success: true,
      otp,
      user_id: credential.user_id,
      generated_at: generatedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      valid_for_seconds: validForSeconds,
    });
  } catch (error) {
    return buildErrorResponse(
      res,
      422,
      'TOTP_GENERATION_FAILED',
      error.message || 'Failed to generate TOTP.'
    );
  }
});
