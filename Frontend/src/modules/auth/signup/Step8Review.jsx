import { useState } from 'react';
import LegalBottomSheet from '../../../components/shared/LegalBottomSheet';

const SEGMENT_LABELS = { EQUITY: 'Equity', 'F&O': 'F&O', COMMODITY: 'Commodity', CURRENCY: 'Currency' };

const Row = ({ label, value }) => (
  value ? (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className="text-[#111418] text-xs font-medium text-right">{value}</span>
    </div>
  ) : null
);

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
    <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
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
  panCard: 'PAN Card', aadhaarFront: 'Aadhaar Front', aadhaarBack: 'Aadhaar Back',
  passportPhoto: 'Passport Photo', signature: 'Signature', bankProof: 'Bank Proof',
  incomeProof: 'Income Proof',
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

const Step8Review = ({ data, onUpdate, onGoToStep }) => {
  const docs = data.documents || {};
  const uploadedDocs = Object.entries(docs).filter(([, v]) => v?.url);
  const [activeLegalDocument, setActiveLegalDocument] = useState(null);

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
          Review your information before submitting. Click any section to edit.
        </p>
      </div>

      {/* Broker */}
      {data.broker_id && (
        <Section title="Broker">
          <Row label="Broker" value={data.broker_name} />
          <Row label="Code" value={data.broker_code} />
          <Row label="City" value={data.broker_city} />
        </Section>
      )}

      {/* Personal */}
      <Section title="Personal Information">
        <button type="button" onClick={() => onGoToStep(2)} className="w-full text-left">
          <Row label="Full Name" value={data.full_name} />
          <Row label="Date of Birth" value={data.date_of_birth} />
          <Row label="Gender" value={data.gender ? data.gender.charAt(0).toUpperCase() + data.gender.slice(1) : ''} />
          <Row label="PAN" value={data.pan_number ? data.pan_number.slice(0,5) + '***' + data.pan_number.slice(-1) : ''} />
          <Row label="Aadhaar" value={data.aadhaar_number ? '****-****-' + data.aadhaar_number.slice(-4) : ''} />
          <Row label="Occupation" value={OCCUPATION_LABELS[data.occupation] || data.occupation} />
          <Row label="Annual Income" value={INCOME_LABELS[data.annual_income] || ''} />
        </button>
      </Section>

      {/* Contact */}
      <Section title="Contact & Address">
        <button type="button" onClick={() => onGoToStep(3)} className="w-full text-left">
          <Row label="Mobile" value={data.mobile_number} />
          <Row label="Email" value={data.email} />
          <Row label="Address" value={[data.address?.street, data.address?.city, data.address?.state, data.address?.pincode].filter(Boolean).join(', ')} />
        </button>
      </Section>

      {/* Security */}
      <Section title="Account">
        <button type="button" onClick={() => onGoToStep(4)} className="w-full text-left">
          <Row label="User ID" value={data.userId} />
          <Row label="Password" value="••••••••" />
        </button>
      </Section>

      {/* Nominee */}
      {data.nominee?.name && (
        <Section title="Nominee">
          <button type="button" onClick={() => onGoToStep(5)} className="w-full text-left">
            <Row label="Name" value={data.nominee.name} />
            <Row label="Relation" value={data.nominee.relation} />
            <Row label="DOB" value={data.nominee.date_of_birth} />
          </button>
        </Section>
      )}

      {/* Segments */}
      {(data.segments || []).length > 0 && (
        <Section title="Trading Segments">
          <div className="py-2 flex flex-wrap gap-1.5">
            {(data.segments || []).map((s) => (
              <span key={s} className="px-2 py-0.5 bg-[#137fec]/10 text-[#137fec] rounded-full text-[11px] font-semibold">
                {SEGMENT_LABELS[s] || s}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Documents */}
      {uploadedDocs.length > 0 && (
        <Section title="Documents">
          {uploadedDocs.map(([key]) => (
            <Row key={key} label={DOC_LABELS[key] || key} value="Uploaded" />
          ))}
        </Section>
      )}

      {/* Consent */}
      <div className="flex flex-col gap-2.5 mt-1">
        <div className="flex items-start gap-2.5">
          <input
            id="legacy-review-terms-agreed"
            type="checkbox"
            checked={!!data.terms_agreed}
            onChange={(e) => onUpdate({ terms_agreed: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec] shrink-0"
          />
          <label htmlFor="legacy-review-terms-agreed" className="cursor-pointer text-[11px] sm:text-xs text-gray-600 leading-relaxed">
            I confirm all information is correct and matches my KYC documents.
          </label>
        </div>

        <div className="flex items-start gap-2.5">
          <input
            id="legacy-review-data-consent"
            type="checkbox"
            checked={!!data.data_consent}
            onChange={(e) => onUpdate({ data_consent: e.target.checked })}
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#137fec] focus:ring-[#137fec] shrink-0"
          />

          <div className="text-[11px] sm:text-xs text-gray-600 leading-relaxed">
            <label htmlFor="legacy-review-data-consent" className="cursor-pointer">
              I agree to the{' '}
            </label>
            <InlineLegalButton onClick={openLegalDocument('terms')}>Terms & Conditions</InlineLegalButton>
            <label htmlFor="legacy-review-data-consent" className="cursor-pointer">
              {' '}and{' '}
            </label>
            <InlineLegalButton onClick={openLegalDocument('privacy')}>Privacy Policy</InlineLegalButton>
            <label htmlFor="legacy-review-data-consent" className="cursor-pointer">
              , and Risk Disclosure.
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

export default Step8Review;
