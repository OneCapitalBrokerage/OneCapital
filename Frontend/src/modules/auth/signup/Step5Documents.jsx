import { useRef } from 'react';
import customerApi from '../../../api/customer';

const DOCS = [
  { key: 'panCard', label: 'PAN Card', icon: 'credit_card', required: true, desc: 'Clear photo of PAN card — name and number visible' },
  { key: 'aadhaarFront', label: 'Aadhaar Front', icon: 'badge', required: true, desc: 'Front side of Aadhaar — photo and name visible' },
  { key: 'aadhaarBack', label: 'Aadhaar Back', icon: 'badge', required: true, desc: 'Back side of Aadhaar card' },
];

const InputRow = ({ icon, label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[#111418] text-xs sm:text-sm font-medium">{label}</label>
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">{icon}</span>
      {children}
    </div>
  </div>
);

const inputCls = (hasError) =>
  `w-full rounded-xl border bg-white h-10 sm:h-11 pl-10 pr-3 text-sm focus:ring-1 focus:ring-[#137fec] outline-none transition-all placeholder:text-gray-400 ${
    hasError ? 'border-red-400 focus:border-red-400' : 'border-[#dbe0e6] focus:border-[#137fec]'
  }`;

const UploadBox = ({ label, desc, imageUrl, onUpload, uploading }) => {
  const fileRef = useRef(null);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[#617589] text-[12px] sm:text-[13px] font-medium">{label}</label>
      {imageUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-[#f6f7f8]">
          <img src={imageUrl} alt={label} className="w-full h-36 sm:h-44 object-cover" />
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
          className="flex flex-col items-center justify-center h-32 sm:h-36 rounded-xl border-2 border-dashed border-gray-300 bg-[#f6f7f8] hover:border-[#137fec] transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-[28px] text-[#137fec] animate-spin">progress_activity</span>
              <span className="text-[#617589] text-[12px]">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="material-symbols-outlined text-[28px] text-gray-400">add_photo_alternate</span>
              <span className="text-[#617589] text-[12px]">Tap to upload</span>
              <span className="text-gray-400 text-[11px] text-center px-4">{desc}</span>
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

const Step5Documents = ({ data, onUpdate, uploading, setUploading, errors }) => {
  const docs = data.documents || {};

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
      console.error(`Upload failed for ${key}:`, err);
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Count required docs uploaded
  const requiredDocs = DOCS.filter((d) => d.required);
  const uploadedCount = requiredDocs.filter((d) => docs[d.key]?.url).length;

  const handlePanChange = (value) => {
    onUpdate({ pan_number: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) });
  };

  const handleAadhaarChange = (value) => {
    onUpdate({ aadhaar_number: value.replace(/\D/g, '').slice(0, 12) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Documents</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          Fill PAN and Aadhaar details, then upload clear supporting photos.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <InputRow icon="credit_card" label="PAN Number">
          <input
            type="text"
            value={data.pan_number}
            onChange={(e) => handlePanChange(e.target.value)}
            maxLength={10}
            placeholder="ABCDE1234F"
            className={`${inputCls(!!errors?.pan_number)} font-mono uppercase`}
          />
          {errors?.pan_number && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{errors.pan_number}</p>}
        </InputRow>

        <InputRow icon="fingerprint" label="Aadhaar Number">
          <input
            type="text"
            value={data.aadhaar_number}
            onChange={(e) => handleAadhaarChange(e.target.value)}
            maxLength={12}
            placeholder="12-digit Aadhaar"
            className={`${inputCls(!!errors?.aadhaar_number)} font-mono`}
          />
          {errors?.aadhaar_number && <p className="text-red-500 text-[11px] mt-0.5 pl-1">{errors.aadhaar_number}</p>}
        </InputRow>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#137fec] rounded-full transition-all"
            style={{ width: `${(uploadedCount / requiredDocs.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-[#617589] shrink-0">{uploadedCount}/{requiredDocs.length} required</span>
      </div>

      {/* Document upload boxes */}
      <div className="flex flex-col gap-4">
        {DOCS.map((doc) => (
          <div key={doc.key}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="material-symbols-outlined text-[16px] text-gray-400">{doc.icon}</span>
              <p className="text-[#111418] text-xs font-semibold">{doc.label}</p>
              {doc.required
                ? <span className="text-red-500 text-[10px]">*</span>
                : <span className="text-gray-400 text-[10px]">(optional)</span>
              }
              {docs[doc.key]?.url && (
                <span className="ml-auto material-symbols-outlined text-green-500 text-[16px]">check_circle</span>
              )}
            </div>
            <UploadBox
              label=""
              desc={doc.desc}
              imageUrl={docs[doc.key]?.url || null}
              uploading={uploading?.[doc.key] || false}
              onUpload={(file) => uploadFile(doc.key, file)}
            />
          </div>
        ))}
      </div>

      {errors?.documents && (
        <p className="text-red-500 text-[11px] -mt-1">{errors.documents}</p>
      )}

      <p className="text-gray-400 text-[10px] text-center">
        Accepted: JPG, PNG, PDF · Max 5MB per file
      </p>
    </div>
  );
};

export default Step5Documents;
