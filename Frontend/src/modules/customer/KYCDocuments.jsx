import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';

const STATUS_CONFIG = {
  not_submitted: { label: 'Not Submitted', bg: 'bg-gray-100 dark:bg-[#16231d]', text: 'text-gray-500 dark:text-[#6f8b7f]', icon: 'circle' },
  pending: { label: 'Pending', bg: 'bg-yellow-50 dark:bg-amber-900/20', text: 'text-yellow-700 dark:text-amber-400', icon: 'schedule' },
  in_process: { label: 'In Process', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400', icon: 'pending' },
  approved: { label: 'Approved', bg: 'bg-green-50 dark:bg-emerald-900/20', text: 'text-green-600 dark:text-emerald-400', icon: 'check_circle' },
  rejected: { label: 'Rejected', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-500 dark:text-red-400', icon: 'cancel' },
};

const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_submitted;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] sm:text-[12px] font-medium ${config.bg} ${config.text}`}>
      <span className="material-symbols-outlined text-[14px]">{config.icon}</span>
      {config.label}
    </span>
  );
};

const UploadBox = ({ label, imageUrl, onUpload, uploading, disabled }) => {
  const fileRef = useRef(null);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium">{label}</label>
      {imageUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-[#22352d] bg-[#f6f7f8] dark:bg-[#16231d]">
          <img src={imageUrl} alt={label} className="w-full h-36 sm:h-44 object-cover" />
          {!disabled && (
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-2 right-2 bg-white/90 dark:bg-[#1e2f28]/95 rounded-lg px-2.5 py-1 text-[12px] font-medium text-[#137fec] dark:text-[#34d399] shadow-sm"
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          className="flex flex-col items-center justify-center h-32 sm:h-40 rounded-xl border-2 border-dashed border-gray-300 dark:border-[#22352d] bg-[#f6f7f8] dark:bg-[#16231d] hover:border-[#137fec] dark:hover:border-[#10b981] transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-[28px] text-[#137fec] animate-spin">progress_activity</span>
              <span className="text-[#617589] text-[12px]">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-[28px] text-gray-400 dark:text-[#6f8b7f]">add_photo_alternate</span>
              <span className="text-[#617589] dark:text-[#9cb7aa] text-[12px]">Tap to upload</span>
            </div>
          )}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
};

const EMPTY_BANK_FORM = {
  bank_name: '',
  account_number: '',
  confirm_account: '',
  ifsc_code: '',
  account_holder_name: '',
  account_type: 'savings',
};

const KYCDocuments = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState(null);
  const [uploadingField, setUploadingField] = useState(null);
  const [submitting, setSubmitting] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // KYC data from API
  const [kyc, setKyc] = useState({
    aadhaar: { number: '', front: null, back: null, status: 'not_submitted', rejection_reason: null },
    pan: { number: '', front: null, back: null, signature: null, status: 'not_submitted', rejection_reason: null },
    bank_proof: { document: null, status: 'not_submitted', rejection_reason: null },
    overall_status: 'not_submitted',
  });

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankForm, setBankForm] = useState(EMPTY_BANK_FORM);

  // Local form state (for editable fields)
  const [aadhaarNum, setAadhaarNum] = useState('');
  const [aadhaarFront, setAadhaarFront] = useState(null);
  const [aadhaarBack, setAadhaarBack] = useState(null);

  const [panNum, setPanNum] = useState('');
  const [panFront, setPanFront] = useState(null);
  const [panBack, setPanBack] = useState(null);
  const [panSignature, setPanSignature] = useState(null);

  const [bankDoc, setBankDoc] = useState(null);

  const fetchKyc = useCallback(async () => {
    setLoading(true);
    try {
      const [kycRes, bankRes] = await Promise.all([
        customerApi.getKycDocuments(),
        customerApi.getBankAccounts().catch(() => null),
      ]);
      if (kycRes.kyc) {
        setKyc(kycRes.kyc);
        // Pre-fill local state from API
        if (kycRes.kyc.aadhaar) {
          setAadhaarNum(kycRes.kyc.aadhaar.number || '');
          setAadhaarFront(kycRes.kyc.aadhaar.front);
          setAadhaarBack(kycRes.kyc.aadhaar.back);
        }
        if (kycRes.kyc.pan) {
          setPanNum(kycRes.kyc.pan.number || '');
          setPanFront(kycRes.kyc.pan.front);
          setPanBack(kycRes.kyc.pan.back);
          setPanSignature(kycRes.kyc.pan.signature);
        }
        if (kycRes.kyc.bank_proof) {
          setBankDoc(kycRes.kyc.bank_proof.document);
        }
      }
      if (bankRes?.accounts) {
        setBankAccounts(bankRes.accounts);
      }
    } catch (err) {
      console.error('Failed to fetch KYC:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKyc();
  }, [fetchKyc]);

  // Upload file to Cloudinary
  const uploadToCloudinary = async (file) => {
    const sigRes = await customerApi.getKycUploadSignature();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', sigRes.apiKey);
    formData.append('timestamp', sigRes.timestamp);
    formData.append('signature', sigRes.signature);
    formData.append('folder', sigRes.folder);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${sigRes.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    const data = await uploadRes.json();
    if (!data.secure_url) throw new Error('Upload failed');
    return { url: data.secure_url, public_id: data.public_id };
  };

  const handleUpload = async (file, fieldName, setter) => {
    setUploadingField(fieldName);
    setError('');
    try {
      const result = await uploadToCloudinary(file);
      setter(result.url);
      return result;
    } catch (err) {
      setError('Failed to upload image. Please try again.');
      return null;
    } finally {
      setUploadingField(null);
    }
  };

  // Upload helpers that store both url and public_id
  const [uploadedFiles, setUploadedFiles] = useState({});
  const handleUploadWithMeta = async (file, fieldName, setter) => {
    setUploadingField(fieldName);
    setError('');
    try {
      const result = await uploadToCloudinary(file);
      setter(result.url);
      setUploadedFiles(prev => ({ ...prev, [fieldName]: result }));
      return result;
    } catch (err) {
      setError('Failed to upload image. Please try again.');
      return null;
    } finally {
      setUploadingField(null);
    }
  };

  // Submit Aadhaar
  const handleSubmitAadhaar = async () => {
    setError('');
    setSuccess('');
    if (!aadhaarNum || !aadhaarFront || !aadhaarBack) {
      setError('Please fill Aadhaar number and upload both front and back photos');
      return;
    }
    setSubmitting('aadhaar');
    try {
      await customerApi.submitAadhaarKyc({
        number: aadhaarNum.replace(/\s/g, ''),
        front_url: typeof aadhaarFront === 'string' ? aadhaarFront : aadhaarFront?.url,
        front_public_id: uploadedFiles.aadhaar_front?.public_id || null,
        back_url: typeof aadhaarBack === 'string' ? aadhaarBack : aadhaarBack?.url,
        back_public_id: uploadedFiles.aadhaar_back?.public_id || null,
      });
      setSuccess('Aadhaar submitted for verification');
      fetchKyc();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit Aadhaar');
    } finally {
      setSubmitting(null);
    }
  };

  // Submit PAN
  const handleSubmitPan = async () => {
    setError('');
    setSuccess('');
    if (!panNum || !panFront || !panBack || !panSignature) {
      setError('Please fill PAN number and upload front, back photos and signature');
      return;
    }
    setSubmitting('pan');
    try {
      await customerApi.submitPanKyc({
        number: panNum.toUpperCase(),
        front_url: typeof panFront === 'string' ? panFront : panFront?.url,
        front_public_id: uploadedFiles.pan_front?.public_id || null,
        back_url: typeof panBack === 'string' ? panBack : panBack?.url,
        back_public_id: uploadedFiles.pan_back?.public_id || null,
        signature_url: typeof panSignature === 'string' ? panSignature : panSignature?.url,
        signature_public_id: uploadedFiles.pan_signature?.public_id || null,
      });
      setSuccess('PAN submitted for verification');
      fetchKyc();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit PAN');
    } finally {
      setSubmitting(null);
    }
  };

  const handleBankFormChange = (field, value) => {
    setBankForm(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  // Submit bank account details + proof together (first-time flow)
  const handleSubmitBankWithDetails = async () => {
    setError('');
    setSuccess('');
    if (!bankForm.bank_name || !bankForm.account_number || !bankForm.ifsc_code || !bankForm.account_holder_name) {
      setError('Please fill all bank account fields');
      return;
    }
    if (bankForm.account_number !== bankForm.confirm_account) {
      setError('Account numbers do not match');
      return;
    }
    if (bankForm.ifsc_code.length !== 11) {
      setError('IFSC code must be 11 characters');
      return;
    }
    if (!bankDoc) {
      setError('Please upload passbook or cancelled cheque photo');
      return;
    }
    setSubmitting('bank_proof');
    try {
      // Step 1: save bank account details
      await customerApi.addBankAccount({
        bank_name: bankForm.bank_name,
        account_number: bankForm.account_number,
        ifsc_code: bankForm.ifsc_code,
        account_holder_name: bankForm.account_holder_name,
        account_type: bankForm.account_type,
      });
      // Step 2: submit proof document
      await customerApi.submitBankProofKyc({
        document_url: typeof bankDoc === 'string' ? bankDoc : bankDoc?.url,
        document_public_id: uploadedFiles.bank_doc?.public_id || null,
      });
      setSuccess('Bank account added and proof submitted for verification');
      fetchKyc();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save bank account details');
    } finally {
      setSubmitting(null);
    }
  };

  // Submit Bank Proof
  const handleSubmitBankProof = async () => {
    setError('');
    setSuccess('');
    if (!bankDoc) {
      setError('Please upload passbook or cancelled cheque photo');
      return;
    }
    setSubmitting('bank_proof');
    try {
      await customerApi.submitBankProofKyc({
        document_url: typeof bankDoc === 'string' ? bankDoc : bankDoc?.url,
        document_public_id: uploadedFiles.bank_doc?.public_id || null,
      });
      setSuccess('Bank proof submitted for verification');
      fetchKyc();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit bank proof');
    } finally {
      setSubmitting(null);
    }
  };

  const getImageUrl = (val) => {
    if (!val) return null;
    if (typeof val === 'string') return val;
    return val.url || null;
  };

  const isApproved = (status) => status === 'approved';
  const canEdit = (status) => status !== 'approved' && status !== 'in_process';

  const toggleCard = (card) => {
    setExpandedCard(expandedCard === card ? null : card);
    setError('');
    setSuccess('');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f2f4f6] dark:bg-[#050806]">
      {/* Header */}
      <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between sticky top-0 z-10 bg-[#f2f4f6] dark:bg-[#050806]">
        <button
          onClick={() => navigate(-1)}
          className="flex size-9 sm:size-10 items-center justify-start rounded-full hover:opacity-70 transition-opacity -ml-1.5 sm:-ml-2"
        >
          <span className="material-symbols-outlined text-[#111418] dark:text-[#e8f3ee] text-[24px] sm:text-[28px]">arrow_back</span>
        </button>
        <h2 className="text-[#111418] dark:text-[#e8f3ee] text-[15px] sm:text-[17px] font-bold leading-tight">KYC Verification</h2>
        <div className="size-9 sm:size-10" />
      </div>

      {/* Overall Status */}
      <div className="px-3 sm:px-4 mt-1">
        <div className="flex items-center justify-between bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-3 sm:p-4 shadow-sm">
          <div>
            <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-semibold">Overall Status</p>
            <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[12px] mt-0.5">Complete all 3 sections for full verification</p>
          </div>
          <StatusBadge status={kyc.overall_status} />
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="px-3 sm:px-4 mt-2">
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[13px] px-3 py-2.5 rounded-lg">{error}</div>
        </div>
      )}
      {success && (
        <div className="px-3 sm:px-4 mt-2">
          <div className="bg-green-50 dark:bg-emerald-900/20 text-green-600 dark:text-emerald-400 text-[13px] px-3 py-2.5 rounded-lg">{success}</div>
        </div>
      )}

      {loading ? (
        <div className="px-3 sm:px-4 mt-4 flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] p-4 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-5 bg-gray-200 rounded w-32"></div>
                <div className="h-5 bg-gray-200 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 sm:px-4 mt-3 sm:mt-4 flex flex-col gap-3 pb-8">

          {/* =========== AADHAAR CARD =========== */}
          <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm overflow-hidden">
            <button
              onClick={() => toggleCard('aadhaar')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 bg-[#f6f7f8] dark:bg-[#16231d] rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[22px]">badge</span>
                </div>
                <div className="text-left">
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-semibold">Aadhaar Card</p>
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[12px]">Number + Front & Back photos</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={kyc.aadhaar?.status} />
                <span className={`material-symbols-outlined text-gray-400 dark:text-[#6f8b7f] text-[20px] transition-transform ${expandedCard === 'aadhaar' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </div>
            </button>

            {expandedCard === 'aadhaar' && (
              <div className="px-3.5 sm:px-4 pb-4 pt-0 flex flex-col gap-3 border-t border-gray-100 dark:border-[#22352d]">
                {kyc.aadhaar?.rejection_reason && (
                  <div className="mt-3 bg-red-50 text-red-600 text-[12px] px-3 py-2 rounded-lg">
                    Rejected: {kyc.aadhaar.rejection_reason}
                  </div>
                )}

                {isApproved(kyc.aadhaar?.status) && (
                  <div className="mt-3 flex items-start gap-1.5 bg-green-50 py-2 px-2.5 rounded-lg">
                    <span className="material-symbols-outlined text-green-600 text-[16px] mt-[1px]">lock</span>
                    <p className="text-green-700 text-[11px] sm:text-[12px] font-medium leading-tight">
                      Aadhaar verified and locked. Details cannot be changed.
                    </p>
                  </div>
                )}

                <div className="mt-3">
                  <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">Aadhaar Number</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={aadhaarNum}
                    onChange={(e) => setAadhaarNum(e.target.value.replace(/[^\d\s]/g, '').slice(0, 14))}
                    placeholder="1234 5678 9012"
                    disabled={isApproved(kyc.aadhaar?.status)}
                    className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none focus:border-[#137fec] dark:focus:border-[#10b981] transition-colors disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <UploadBox
                    label="Front Side"
                    imageUrl={getImageUrl(aadhaarFront)}
                    uploading={uploadingField === 'aadhaar_front'}
                    disabled={!canEdit(kyc.aadhaar?.status)}
                    onUpload={(file) => handleUploadWithMeta(file, 'aadhaar_front', setAadhaarFront)}
                  />
                  <UploadBox
                    label="Back Side"
                    imageUrl={getImageUrl(aadhaarBack)}
                    uploading={uploadingField === 'aadhaar_back'}
                    disabled={!canEdit(kyc.aadhaar?.status)}
                    onUpload={(file) => handleUploadWithMeta(file, 'aadhaar_back', setAadhaarBack)}
                  />
                </div>

                {canEdit(kyc.aadhaar?.status) && (
                  <button
                    onClick={handleSubmitAadhaar}
                    disabled={submitting === 'aadhaar' || !aadhaarNum || !aadhaarFront || !aadhaarBack}
                    className="w-full h-11 sm:h-12 bg-[#137fec] hover:bg-blue-600 text-white rounded-xl text-[14px] sm:text-[15px] font-semibold transition-colors disabled:opacity-50 mt-1"
                  >
                    {submitting === 'aadhaar' ? 'Submitting...' : kyc.aadhaar?.status === 'rejected' ? 'Resubmit Aadhaar' : 'Submit Aadhaar'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* =========== PAN CARD =========== */}
          <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm overflow-hidden">
            <button
              onClick={() => toggleCard('pan')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 bg-[#f6f7f8] dark:bg-[#16231d] rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[22px]">credit_card</span>
                </div>
                <div className="text-left">
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-semibold">PAN Card</p>
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[12px]">Number + Photos + Signature</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={kyc.pan?.status} />
                <span className={`material-symbols-outlined text-gray-400 dark:text-[#6f8b7f] text-[20px] transition-transform ${expandedCard === 'pan' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </div>
            </button>

            {expandedCard === 'pan' && (
              <div className="px-3.5 sm:px-4 pb-4 pt-0 flex flex-col gap-3 border-t border-gray-100 dark:border-[#22352d]">
                {kyc.pan?.rejection_reason && (
                  <div className="mt-3 bg-red-50 text-red-600 text-[12px] px-3 py-2 rounded-lg">
                    Rejected: {kyc.pan.rejection_reason}
                  </div>
                )}

                {isApproved(kyc.pan?.status) && (
                  <div className="mt-3 flex items-start gap-1.5 bg-green-50 py-2 px-2.5 rounded-lg">
                    <span className="material-symbols-outlined text-green-600 text-[16px] mt-[1px]">lock</span>
                    <p className="text-green-700 text-[11px] sm:text-[12px] font-medium leading-tight">
                      PAN verified and locked. Details cannot be changed.
                    </p>
                  </div>
                )}

                <div className="mt-3">
                  <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">PAN Number</label>
                  <input
                    type="text"
                    value={panNum}
                    onChange={(e) => setPanNum(e.target.value.toUpperCase().slice(0, 10))}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    disabled={isApproved(kyc.pan?.status)}
                    className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none focus:border-[#137fec] dark:focus:border-[#10b981] transition-colors disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <UploadBox
                    label="Front Side"
                    imageUrl={getImageUrl(panFront)}
                    uploading={uploadingField === 'pan_front'}
                    disabled={!canEdit(kyc.pan?.status)}
                    onUpload={(file) => handleUploadWithMeta(file, 'pan_front', setPanFront)}
                  />
                  <UploadBox
                    label="Back Side"
                    imageUrl={getImageUrl(panBack)}
                    uploading={uploadingField === 'pan_back'}
                    disabled={!canEdit(kyc.pan?.status)}
                    onUpload={(file) => handleUploadWithMeta(file, 'pan_back', setPanBack)}
                  />
                </div>

                <UploadBox
                  label="Signature"
                  imageUrl={getImageUrl(panSignature)}
                  uploading={uploadingField === 'pan_signature'}
                  disabled={!canEdit(kyc.pan?.status)}
                  onUpload={(file) => handleUploadWithMeta(file, 'pan_signature', setPanSignature)}
                />

                {canEdit(kyc.pan?.status) && (
                  <button
                    onClick={handleSubmitPan}
                    disabled={submitting === 'pan' || !panNum || !panFront || !panBack || !panSignature}
                    className="w-full h-11 sm:h-12 bg-[#137fec] hover:bg-blue-600 text-white rounded-xl text-[14px] sm:text-[15px] font-semibold transition-colors disabled:opacity-50 mt-1"
                  >
                    {submitting === 'pan' ? 'Submitting...' : kyc.pan?.status === 'rejected' ? 'Resubmit PAN' : 'Submit PAN'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* =========== BANK ACCOUNT VERIFICATION =========== */}
          <div className="bg-white dark:bg-[#111b17] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm overflow-hidden">
            <button
              onClick={() => toggleCard('bank_proof')}
              className="w-full flex items-center justify-between p-3.5 sm:p-4"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 bg-[#f6f7f8] dark:bg-[#16231d] rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[22px]">account_balance</span>
                </div>
                <div className="text-left">
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-semibold">Bank Account</p>
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[12px]">Passbook or Cancelled Cheque</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={kyc.bank_proof?.status} />
                <span className={`material-symbols-outlined text-gray-400 dark:text-[#6f8b7f] text-[20px] transition-transform ${expandedCard === 'bank_proof' ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </div>
            </button>

            {expandedCard === 'bank_proof' && (
              <div className="px-3.5 sm:px-4 pb-4 pt-0 flex flex-col gap-3 border-t border-gray-100 dark:border-[#22352d]">
                {kyc.bank_proof?.rejection_reason && (
                  <div className="mt-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[12px] px-3 py-2 rounded-lg">
                    Rejected: {kyc.bank_proof.rejection_reason}
                  </div>
                )}

                {/* ── No bank account yet: show full inline form ── */}
                {bankAccounts.length === 0 ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex items-start gap-1.5 bg-[#e6f2ff] dark:bg-blue-900/20 py-2 px-2.5 rounded-lg">
                      <span className="material-symbols-outlined text-[#137fec] text-[16px] mt-[1px]">info</span>
                      <p className="text-[#137fec] dark:text-blue-300 text-[11px] sm:text-[12px] font-medium leading-tight">
                        No bank account linked yet. Fill in your account details and upload a passbook or cancelled cheque photo to complete verification.
                      </p>
                    </div>

                    {/* Bank Name */}
                    <div>
                      <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">Bank Name</label>
                      <input
                        type="text"
                        value={bankForm.bank_name}
                        onChange={(e) => handleBankFormChange('bank_name', e.target.value)}
                        placeholder="e.g. State Bank of India"
                        className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none focus:border-[#137fec] dark:focus:border-[#10b981] transition-colors"
                      />
                    </div>

                    {/* Account Number */}
                    <div>
                      <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">Account Number</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={bankForm.account_number}
                        onChange={(e) => handleBankFormChange('account_number', e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter account number"
                        className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none focus:border-[#137fec] dark:focus:border-[#10b981] transition-colors"
                      />
                    </div>

                    {/* Confirm Account Number */}
                    <div>
                      <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">Confirm Account Number</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={bankForm.confirm_account}
                        onChange={(e) => handleBankFormChange('confirm_account', e.target.value.replace(/\D/g, ''))}
                        placeholder="Re-enter account number"
                        className={`w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none transition-colors ${
                          bankForm.confirm_account && bankForm.account_number !== bankForm.confirm_account
                            ? 'border-red-400 focus:border-red-500'
                            : 'border-gray-200 dark:border-[#22352d] focus:border-[#137fec] dark:focus:border-[#10b981]'
                        }`}
                      />
                      {bankForm.confirm_account && bankForm.account_number !== bankForm.confirm_account && (
                        <p className="text-red-500 text-[11px] mt-0.5">Account numbers do not match</p>
                      )}
                    </div>

                    {/* IFSC Code */}
                    <div>
                      <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">IFSC Code</label>
                      <input
                        type="text"
                        value={bankForm.ifsc_code}
                        onChange={(e) => handleBankFormChange('ifsc_code', e.target.value.toUpperCase().slice(0, 11))}
                        placeholder="e.g. SBIN0001234"
                        maxLength={11}
                        className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none focus:border-[#137fec] dark:focus:border-[#10b981] transition-colors"
                      />
                    </div>

                    {/* Account Holder Name */}
                    <div>
                      <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">Account Holder Name</label>
                      <input
                        type="text"
                        value={bankForm.account_holder_name}
                        onChange={(e) => handleBankFormChange('account_holder_name', e.target.value)}
                        placeholder="Name as per bank records"
                        className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none focus:border-[#137fec] dark:focus:border-[#10b981] transition-colors"
                      />
                    </div>

                    {/* Account Type */}
                    <div>
                      <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">Account Type</label>
                      <div className="flex gap-3">
                        {['savings', 'current'].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => handleBankFormChange('account_type', type)}
                            className={`flex-1 h-11 sm:h-12 rounded-xl text-[14px] sm:text-[15px] font-medium border transition-colors ${
                              bankForm.account_type === type
                                ? 'bg-[#137fec] text-white border-[#137fec]'
                                : 'bg-[#f6f7f8] dark:bg-[#16231d] text-[#111418] dark:text-[#e8f3ee] border-gray-200 dark:border-[#22352d]'
                            }`}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-gray-100 dark:border-[#22352d] pt-2">
                      <p className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-2">
                        Bank Proof Document
                      </p>
                      <UploadBox
                        label="Passbook / Cancelled Cheque"
                        imageUrl={getImageUrl(bankDoc)}
                        uploading={uploadingField === 'bank_doc'}
                        disabled={false}
                        onUpload={(file) => handleUploadWithMeta(file, 'bank_doc', setBankDoc)}
                      />
                    </div>

                    <button
                      onClick={handleSubmitBankWithDetails}
                      disabled={submitting === 'bank_proof'}
                      className="w-full h-11 sm:h-12 bg-[#137fec] hover:bg-blue-600 text-white rounded-xl text-[14px] sm:text-[15px] font-semibold transition-colors disabled:opacity-50 mt-1"
                    >
                      {submitting === 'bank_proof' ? 'Saving...' : 'Save & Submit Bank Proof'}
                    </button>
                  </div>
                ) : (
                  /* ── Bank account already exists: show summary + proof upload ── */
                  <div className="mt-3 flex flex-col gap-3">
                    {/* Existing account summary */}
                    {(() => {
                      const acc = bankAccounts[0];
                      return (
                        <div className="flex items-center justify-between bg-[#f6f7f8] dark:bg-[#16231d] rounded-xl px-3.5 py-3 border border-gray-200 dark:border-[#22352d]">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[22px] shrink-0">account_balance</span>
                            <div className="min-w-0">
                              <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] sm:text-[14px] font-semibold truncate">{acc.bank_name}</p>
                              <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[12px]">
                                {acc.account_number_masked || '****'} &middot; {acc.ifsc_code} &middot; <span className="capitalize">{acc.account_type}</span>
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => navigate(`/profile/bank-account/edit/${acc._id}`)}
                            className="text-[#137fec] dark:text-[#34d399] text-[12px] sm:text-[13px] font-semibold shrink-0 ml-2 hover:opacity-80"
                          >
                            Update
                          </button>
                        </div>
                      );
                    })()}

                    <div className="flex items-start gap-1.5 bg-[#e6f2ff] dark:bg-blue-900/20 py-2 px-2.5 rounded-lg">
                      <span className="material-symbols-outlined text-[#137fec] text-[16px] mt-[1px]">info</span>
                      <p className="text-[#137fec] dark:text-blue-300 text-[11px] sm:text-[12px] font-medium leading-tight">
                        Upload a clear photo of your bank passbook (first page) or a blank cancelled cheque. Re-verification required if account details are changed.
                      </p>
                    </div>

                    <UploadBox
                      label="Passbook / Cancelled Cheque"
                      imageUrl={getImageUrl(bankDoc)}
                      uploading={uploadingField === 'bank_doc'}
                      disabled={!canEdit(kyc.bank_proof?.status)}
                      onUpload={(file) => handleUploadWithMeta(file, 'bank_doc', setBankDoc)}
                    />

                    {canEdit(kyc.bank_proof?.status) && (
                      <button
                        onClick={handleSubmitBankProof}
                        disabled={submitting === 'bank_proof' || !bankDoc}
                        className="w-full h-11 sm:h-12 bg-[#137fec] hover:bg-blue-600 text-white rounded-xl text-[14px] sm:text-[15px] font-semibold transition-colors disabled:opacity-50 mt-1"
                      >
                        {submitting === 'bank_proof' ? 'Submitting...' : kyc.bank_proof?.status === 'rejected' ? 'Resubmit Bank Proof' : 'Submit Bank Proof'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default KYCDocuments;
