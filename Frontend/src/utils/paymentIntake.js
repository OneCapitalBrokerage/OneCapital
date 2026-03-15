export const PAYMENT_METHOD_LABELS = {
  upi: 'UPI',
  imps: 'IMPS',
  neft: 'NEFT',
  rtgs: 'RTGS',
  bank_transfer: 'Bank Transfer',
};

export const BANK_TRANSFER_METHODS = ['imps', 'neft', 'rtgs'];

export const DEFAULT_BANK_TRANSFER_DETAILS = Object.freeze({
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  accountType: 'current',
});

export const normalizeBankTransferDetails = (value = {}) => ({
  bankName: String(value.bankName ?? value.bank_name ?? '').trim(),
  accountHolderName: String(value.accountHolderName ?? value.account_holder_name ?? '').trim(),
  accountNumber: String(value.accountNumber ?? value.account_number ?? '').replace(/\s+/g, ''),
  ifscCode: String(value.ifscCode ?? value.ifsc_code ?? '').trim().toUpperCase(),
  accountType: value.accountType === 'savings' || value.account_type === 'savings' ? 'savings' : 'current',
});

export const hasBankTransferDetails = (value = {}) => {
  const normalized = normalizeBankTransferDetails(value);
  return Boolean(normalized.accountNumber && normalized.ifscCode);
};

export const hasUpiPaymentDetails = (paymentInfo = {}) =>
  Boolean(paymentInfo?.qrPhotoUrl);

export const getAvailablePaymentMethods = (paymentInfo = {}) => {
  const methods = [];

  if (hasUpiPaymentDetails(paymentInfo)) {
    methods.push('upi');
  }

  if (hasBankTransferDetails(paymentInfo?.bankTransferDetails)) {
    methods.push('bank_transfer');
  }

  return methods;
};
