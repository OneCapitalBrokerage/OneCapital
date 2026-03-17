import { useState } from 'react';
import LegalBottomSheet from '../../../components/shared/LegalBottomSheet';

const Row = ({ label, value }) =>
  value ? (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className="text-[#111418] text-xs font-medium text-right break-all">{value}</span>
    </div>
  ) : null;

const Section = ({ title, children, onEdit }) => (
  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
      {onEdit && (
        <button type="button" onClick={onEdit} className="text-[#137fec] text-[11px] font-semibold">
          Edit
        </button>
      )}
    </div>
    <div className="px-3 divide-y divide-gray-50">{children}</div>
  </div>
);

const OCCUPATION_LABELS = {
  salaried: 'Salaried', business: 'Business', professional: 'Professional',
  student: 'Student', retired: 'Retired', other: 'Others',
};
const INCOME_LABELS = {
  below_1l: 'Below ₹1L', '1l_5l': '₹1–5L', '5l_10l': '₹5–10L',
  '10l_25l': '₹10–25L', above_25l: 'Above ₹25L',
};
const DOC_LABELS = {
  panCard: 'PAN Card',
  aadhaarFront: 'Aadhaar Front',
  aadhaarBack: 'Aadhaar Back',
};

const InlineLegalButton = ({ children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="font-semibold text-[#137fec] underline decoration-[#137fec]/40 underline-offset-2 transition-colors hover:text-[#0f73d6]"
  >
    {children}
  </button>
);

const Step6Review = ({ data, onUpdate, onGoToStep }) => {
  const docs = data.documents || {};
  const bankDetails = data.bank_details || {};
  const identityDocKeys = ['panCard', 'aadhaarFront', 'aadhaarBack'];
  const uploadedDocs = identityDocKeys.filter((key) => docs[key]?.url);
  const [activeLegalDocument, setActiveLegalDocument] = useState(null);
  const maskedAccount =
    bankDetails.account_number && bankDetails.account_number.length >= 4
      ? `****${bankDetails.account_number.slice(-4)}`
      : bankDetails.account_number;

  const openLegalDocument = (documentKey) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveLegalDocument(documentKey);
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Review & Submit</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          Verify your details. Click "Edit" on any section to go back and correct it.
        </p>
      </div>

      {/* Broker */}
      {data.broker_id && (
        <Section title="Broker" onEdit={() => onGoToStep(1)}>
          <Row label="Broker" value={data.broker_name} />
          <Row label="City" value={data.broker_city} />
          <Row label="Reference Code" value={data.broker_code} />
        </Section>
      )}

      {/* Personal */}
      <Section title="Personal Information" onEdit={() => onGoToStep(2)}>
        <Row label="Full Name" value={data.full_name} />
        <Row label="Date of Birth" value={data.date_of_birth} />
        <Row label="Gender" value={data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : ''} />
        <Row label="Occupation" value={OCCUPATION_LABELS[data.occupation] || data.occupation} />
        <Row label="Annual Income" value={INCOME_LABELS[data.annual_income]} />
      </Section>

      {/* Contact */}
      <Section title="Contact & Address" onEdit={() => onGoToStep(3)}>
        <Row label="Mobile" value={data.mobile_number} />
        <Row label="Email" value={data.email} />
        <Row label="Address" value={[data.address?.street, data.address?.city, data.address?.state, data.address?.pincode].filter(Boolean).join(', ')} />
      </Section>

      {/* Security */}
      <Section title="Password" onEdit={() => onGoToStep(4)}>
        <Row label="Password" value="••••••••" />
      </Section>

      {/* Documents */}
      {uploadedDocs.length > 0 && (
        <Section title={`Documents (${uploadedDocs.length} uploaded)`} onEdit={() => onGoToStep(5)}>
          <Row label="PAN" value={data.pan_number ? data.pan_number.slice(0, 5) + '***' + data.pan_number.slice(-1) : ''} />
          <Row label="Aadhaar" value={data.aadhaar_number ? '****-****-' + data.aadhaar_number.slice(-4) : ''} />
          {uploadedDocs.map((key) => (
            <Row key={key} label={DOC_LABELS[key] || key} value="Uploaded" />
          ))}
        </Section>
      )}

      {/* Bank Details */}
      <Section title="Bank Details" onEdit={() => onGoToStep(6)}>
        <Row label="Bank Name" value={bankDetails.bank_name} />
        <Row label="Account Holder" value={bankDetails.account_holder_name} />
        <Row label="Account Number" value={maskedAccount} />
        <Row label="IFSC" value={bankDetails.ifsc_code} />
        <Row
          label="Account Type"
          value={bankDetails.account_type ? bankDetails.account_type.charAt(0).toUpperCase() + bankDetails.account_type.slice(1) : ''}
        />
        <Row label="Bank Proof" value={docs.bankProof?.url ? 'Uploaded' : ''} />
      </Section>

      {/* Consent checkboxes */}
      <div className="flex flex-col gap-3 mt-1">
        <div className="flex items-start gap-2.5">
          <input
            id="review-terms-agreed"
            type="checkbox"
            checked={!!data.terms_agreed}
            onChange={(e) => onUpdate({ terms_agreed: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec] shrink-0"
          />
          <label htmlFor="review-terms-agreed" className="cursor-pointer text-[11px] sm:text-xs text-gray-600 leading-relaxed">
            I confirm all information is accurate and matches my official KYC documents.
          </label>
        </div>

        <div className="flex items-start gap-2.5">
          <input
            id="review-data-consent"
            type="checkbox"
            checked={!!data.data_consent}
            onChange={(e) => onUpdate({ data_consent: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec] shrink-0"
          />

          <div className="text-[11px] sm:text-xs text-gray-600 leading-relaxed">
            <label htmlFor="review-data-consent" className="cursor-pointer">
              I agree to the{' '}
            </label>
            <InlineLegalButton onClick={openLegalDocument('terms')}>Terms & Conditions</InlineLegalButton>
            <label htmlFor="review-data-consent" className="cursor-pointer">
              {' '}and{' '}
            </label>
            <InlineLegalButton onClick={openLegalDocument('privacy')}>Privacy Policy</InlineLegalButton>
            <label htmlFor="review-data-consent" className="cursor-pointer">
              , and consent to processing of my personal data for account opening.
            </label>
          </div>
        </div>
      </div>

      <LegalBottomSheet
        isOpen={!!activeLegalDocument}
        defaultDocumentKey={activeLegalDocument || 'terms'}
        onClose={() => setActiveLegalDocument(null)}
      />
    </div>
  );
};

export default Step6Review;
