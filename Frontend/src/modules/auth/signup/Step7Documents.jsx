import { useRef } from 'react';
import customerApi from '../../../api/customer';

const DOCS = [
  { key: 'panCard',      label: 'PAN Card',         icon: 'credit_card',      required: true,  desc: 'Clear photo of your PAN card' },
  { key: 'aadhaarFront', label: 'Aadhaar Front',     icon: 'badge',            required: true,  desc: 'Front side of Aadhaar card' },
  { key: 'aadhaarBack',  label: 'Aadhaar Back',      icon: 'badge',            required: true,  desc: 'Back side of Aadhaar card' },
  { key: 'passportPhoto',label: 'Passport Photo',    icon: 'account_circle',   required: true,  desc: 'White background, recent photo' },
  { key: 'signature',    label: 'Signature',         icon: 'draw',             required: true,  desc: 'Signature on white paper' },
  { key: 'bankProof',    label: 'Bank Proof',        icon: 'account_balance',  required: true,  desc: 'Cancelled cheque / passbook first page' },
  { key: 'incomeProof',  label: 'Income Proof',      icon: 'receipt_long',     required: false, desc: 'IT return / salary slip (required for F&O)' },
];

const Step7Documents = ({ data, onUpdate, uploading, setUploading }) => {
  const docs = data.documents || {};
  const fileRefs = useRef({});

  const uploadFile = async (key, file) => {
    setUploading((prev) => ({ ...prev, [key]: true }));
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
          [key]: { url: result.secure_url, public_id: result.public_id },
        },
      });
    } catch (err) {
      console.error(`Failed to upload ${key}:`, err);
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleFileChange = (key) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadFile(key, file);
  };

  const removeDoc = (key) => {
    const updated = { ...docs };
    delete updated[key];
    onUpdate({ documents: updated });
  };

  const foSelected = (data.segments || []).includes('F&O');

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Document Upload</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          Upload clear, readable photos or scans. Files are encrypted and stored securely.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {DOCS.filter((d) => d.required || (d.key === 'incomeProof' && foSelected)).map((doc) => {
          const uploaded = docs[doc.key];
          const isUploading = uploading?.[doc.key];

          return (
            <div
              key={doc.key}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                uploaded ? 'border-green-200 bg-green-50' :
                isUploading ? 'border-[#137fec]/30 bg-[#137fec]/5' :
                'border-[#dbe0e6] bg-white'
              }`}
            >
              <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${uploaded ? 'bg-green-100' : 'bg-gray-100'}`}>
                <span className={`material-symbols-outlined text-[20px] ${uploaded ? 'text-green-600' : 'text-gray-400'}`}>
                  {uploaded ? 'check_circle' : doc.icon}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[#111418] text-xs sm:text-sm font-semibold">{doc.label}</p>
                  {doc.required && <span className="text-red-400 text-[10px]">*</span>}
                  {!doc.required && <span className="text-gray-400 text-[10px]">(optional)</span>}
                </div>
                <p className={`text-[11px] mt-0.5 truncate ${uploaded ? 'text-green-600' : 'text-gray-400'}`}>
                  {uploaded ? 'Uploaded successfully' : doc.desc}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isUploading ? (
                  <div className="h-8 w-8 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#137fec] text-[20px] animate-spin">progress_activity</span>
                  </div>
                ) : uploaded ? (
                  <button
                    type="button"
                    onClick={() => removeDoc(doc.key)}
                    className="h-8 px-2 rounded-lg bg-red-50 text-red-500 text-[11px] font-semibold hover:bg-red-100 transition-colors"
                  >
                    Remove
                  </button>
                ) : (
                  <>
                    <input
                      ref={(el) => { fileRefs.current[doc.key] = el; }}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={handleFileChange(doc.key)}
                    />
                    <button
                      type="button"
                      onClick={() => fileRefs.current[doc.key]?.click()}
                      className="h-8 px-2.5 rounded-lg bg-[#137fec] text-white text-[11px] font-bold hover:bg-[#137fec]/90 transition-colors"
                    >
                      Upload
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-gray-400 text-[10px] sm:text-[11px] text-center mt-1">
        Accepted formats: JPG, PNG, PDF · Max 5MB per file
      </p>
    </div>
  );
};

export default Step7Documents;
