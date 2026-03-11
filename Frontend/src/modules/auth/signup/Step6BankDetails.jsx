import { useRef } from 'react';
import customerApi from '../../../api/customer';

const ACCOUNT_TYPES = ['savings', 'current'];

const inputCls = (hasError, withIcon = true) =>
  `w-full rounded-xl border bg-white h-10 sm:h-11 ${withIcon ? 'pl-10' : 'pl-3'} pr-3 text-sm focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400 ${
    hasError ? 'border-red-400 focus:border-red-400' : 'border-[#dbe0e6] focus:border-[#137fec]'
  }`;

const InputRow = ({ icon, label, error, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[#111418] text-xs sm:text-sm font-medium">{label}</label>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">{icon}</span>
      {children}
    </div>
    {error && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{error}</p>}
  </div>
);

const UploadBox = ({ imageUrl, onUpload, uploading }) => {
  const fileRef = useRef(null);
  return (
    <div className="flex flex-col gap-1.5">
      {imageUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-[#f6f7f8]">
          <img src={imageUrl} alt="Bank proof" className="w-full h-40 sm:h-44 object-cover" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-2 right-2 bg-white/90 rounded-lg px-2.5 py-1 text-[12px] font-medium text-[#137fec] shadow-sm"
          >
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center h-36 rounded-xl border-2 border-dashed border-gray-300 bg-[#f6f7f8] hover:border-[#137fec] transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-[28px] text-[#137fec] animate-spin">progress_activity</span>
              <span className="text-[#617589] text-[12px]">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="material-symbols-outlined text-[28px] text-gray-400">add_photo_alternate</span>
              <span className="text-[#617589] text-[12px]">Upload bank proof</span>
              <span className="text-gray-400 text-[11px] text-center px-4">
                Passbook first page or cancelled cheque
              </span>
            </div>
          )}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
};

const Step6BankDetails = ({ data, onUpdate, uploading, setUploading, errors }) => {
  const docs = data.documents || {};
  const bank = data.bank_details || {
    bank_name: '',
    account_holder_name: '',
    account_number: '',
    confirm_account_number: '',
    ifsc_code: '',
    account_type: 'savings',
  };

  const setBankField = (field, value) => {
    onUpdate({
      bank_details: {
        ...bank,
        [field]: value,
      },
    });
  };

  const uploadBankProof = async (file) => {
    setUploading((prev) => ({ ...prev, bankProof: true }));
    try {
      const sigRes = await customerApi.getUploadSignature();
      const form = new FormData();
      form.append('file', file);
      form.append('api_key', sigRes.apiKey);
      form.append('timestamp', sigRes.timestamp);
      form.append('signature', sigRes.signature);
      form.append('folder', sigRes.folder);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${sigRes.cloudName}/image/upload`,
        { method: 'POST', body: form }
      );
      const result = await res.json();
      if (!result.secure_url) throw new Error('Upload failed');

      onUpdate({
        documents: {
          ...docs,
          bankProof: { url: result.secure_url, public_id: result.public_id },
        },
      });
    } catch (err) {
      console.error('Upload failed for bankProof:', err);
    } finally {
      setUploading((prev) => ({ ...prev, bankProof: false }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Bank Details</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          Enter your primary bank account details and upload bank proof.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <InputRow icon="account_balance" label="Bank Name" error={errors?.['bank_details.bank_name']}>
          <input
            type="text"
            value={bank.bank_name || ''}
            onChange={(e) => setBankField('bank_name', e.target.value)}
            placeholder="e.g. State Bank of India"
            className={inputCls(!!errors?.['bank_details.bank_name'])}
          />
        </InputRow>

        <InputRow icon="person" label="Account Holder Name" error={errors?.['bank_details.account_holder_name']}>
          <input
            type="text"
            value={bank.account_holder_name || ''}
            onChange={(e) => setBankField('account_holder_name', e.target.value)}
            placeholder="As per bank records"
            className={inputCls(!!errors?.['bank_details.account_holder_name'])}
          />
        </InputRow>

        <InputRow icon="payments" label="Account Number" error={errors?.['bank_details.account_number']}>
          <input
            type="text"
            inputMode="numeric"
            value={bank.account_number || ''}
            onChange={(e) => setBankField('account_number', e.target.value.replace(/\D/g, '').slice(0, 20))}
            placeholder="Enter account number"
            className={`${inputCls(!!errors?.['bank_details.account_number'])} font-mono`}
          />
        </InputRow>

        <InputRow icon="payments" label="Confirm Account Number" error={errors?.['bank_details.confirm_account_number']}>
          <input
            type="text"
            inputMode="numeric"
            value={bank.confirm_account_number || ''}
            onChange={(e) => setBankField('confirm_account_number', e.target.value.replace(/\D/g, '').slice(0, 20))}
            placeholder="Re-enter account number"
            className={`${inputCls(!!errors?.['bank_details.confirm_account_number'])} font-mono`}
          />
        </InputRow>

        <InputRow icon="qr_code_2" label="IFSC Code" error={errors?.['bank_details.ifsc_code']}>
          <input
            type="text"
            value={bank.ifsc_code || ''}
            onChange={(e) => setBankField('ifsc_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
            placeholder="e.g. SBIN0001234"
            maxLength={11}
            className={`${inputCls(!!errors?.['bank_details.ifsc_code'])} font-mono uppercase`}
          />
        </InputRow>

        <div className="flex flex-col gap-1">
          <label className="text-[#111418] text-xs sm:text-sm font-medium">Account Type</label>
          <div className="flex gap-2">
            {ACCOUNT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setBankField('account_type', type)}
                className={`flex-1 h-10 sm:h-11 rounded-xl border text-sm font-medium capitalize transition-all ${
                  (bank.account_type || 'savings') === type
                    ? 'border-[#137fec] bg-[#137fec]/10 text-[#137fec]'
                    : 'border-[#dbe0e6] text-gray-500 hover:border-gray-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#f6f7f8] rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-gray-500 text-[18px]">description</span>
          <p className="text-[#111418] text-xs font-semibold">Bank Proof</p>
          {docs.bankProof?.url && (
            <span className="ml-auto material-symbols-outlined text-green-500 text-[16px]">check_circle</span>
          )}
        </div>
        <UploadBox
          imageUrl={docs.bankProof?.url || null}
          uploading={uploading?.bankProof || false}
          onUpload={uploadBankProof}
        />
        {errors?.['documents.bankProof'] && (
          <p className="text-red-500 text-[11px]">{errors['documents.bankProof']}</p>
        )}
      </div>

      <p className="text-gray-400 text-[10px] text-center">
        Accepted: JPG, PNG, PDF · Max 5MB per file
      </p>
    </div>
  );
};

export default Step6BankDetails;
