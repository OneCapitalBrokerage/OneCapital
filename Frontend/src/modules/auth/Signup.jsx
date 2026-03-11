import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';

import StepProgress from './signup/StepProgress';
import Step1BrokerCode from './signup/Step1BrokerCode';
import Step2PersonalInfo from './signup/Step2PersonalInfo';
import Step3ContactAddress from './signup/Step3ContactAddress';
import Step4Security from './signup/Step4Security';
import Step5Documents from './signup/Step5Documents';
import Step6BankDetails from './signup/Step6BankDetails';
import Step6Review from './signup/Step6Review';

const TOTAL_STEPS = 7;

const INITIAL_FORM = {
  // Step 1 — Broker (mandatory)
  broker_code: '', broker_id: null, broker_name: '', broker_city: '',
  // Step 2 — Personal
  full_name: '', date_of_birth: '', gender: '',
  pan_number: '', aadhaar_number: '', occupation: '', annual_income: '',
  // Step 3 — Contact & Address
  mobile_number: '', email: '',
  address: { street: '', city: '', state: '', pincode: '' },
  // Step 4 — Password only
  password: '', confirm_password: '',
  // Step 5 — Documents
  documents: {},
  // Step 6 — Bank details
  bank_details: {
    bank_name: '',
    account_holder_name: '',
    account_number: '',
    confirm_account_number: '',
    ifsc_code: '',
    account_type: 'savings',
  },
  // Step 7 — Consent
  terms_agreed: false,
  data_consent: false,
};

const validateStep = (step, data) => {
  const errs = {};

  if (step === 1) {
    if (!data.broker_code || !data.broker_id) {
      errs.broker_code = 'A valid broker code is required to continue.';
    }
  }

  if (step === 2) {
    if (!data.full_name.trim()) errs.full_name = 'Full name is required.';
    if (!data.date_of_birth) errs.date_of_birth = 'Date of birth is required.';
    else {
      const age = (Date.now() - new Date(data.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18) errs.date_of_birth = 'You must be at least 18 years old.';
    }
    if (!data.gender) errs.gender = 'Please select a gender.';
    if (!data.occupation) errs.occupation = 'Please select your occupation.';
  }

  if (step === 3) {
    if (!data.mobile_number || data.mobile_number.length !== 10) errs.mobile_number = 'Enter a valid 10-digit mobile number.';
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = 'Enter a valid email address.';
    if (!data.address?.street?.trim()) errs['address.street'] = 'Street address is required.';
    if (!data.address?.city?.trim()) errs['address.city'] = 'City is required.';
    if (!data.address?.state) errs['address.state'] = 'Please select a state.';
    if (!data.address?.pincode || data.address.pincode.length !== 6) errs['address.pincode'] = 'Enter a valid 6-digit pincode.';
  }

  if (step === 4) {
    if (!data.password) errs.password = 'Password is required.';
    else if (data.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (data.password !== data.confirm_password) errs.confirm_password = 'Passwords do not match.';
  }

  if (step === 5) {
    if (!data.pan_number) errs.pan_number = 'PAN number is required.';
    else if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(data.pan_number)) errs.pan_number = 'Invalid PAN format (e.g. ABCDE1234F).';
    if (!data.aadhaar_number) errs.aadhaar_number = 'Aadhaar number is required.';
    else if (data.aadhaar_number.length !== 12) errs.aadhaar_number = 'Aadhaar must be 12 digits.';

    const docs = data.documents || {};
    const required = ['panCard', 'aadhaarFront', 'aadhaarBack'];
    const missing = required.filter((k) => !docs[k]?.url);
    if (missing.length > 0) {
      errs.documents = `Please upload all required documents. Missing: ${missing.length} document${missing.length > 1 ? 's' : ''}.`;
    }
  }

  if (step === 6) {
    const bank = data.bank_details || {};
    if (!bank.bank_name?.trim()) errs['bank_details.bank_name'] = 'Bank name is required.';
    if (!bank.account_holder_name?.trim()) errs['bank_details.account_holder_name'] = 'Account holder name is required.';
    if (!bank.account_number || bank.account_number.length < 6) errs['bank_details.account_number'] = 'Enter a valid account number.';
    if (!bank.confirm_account_number) errs['bank_details.confirm_account_number'] = 'Please confirm account number.';
    else if (bank.account_number !== bank.confirm_account_number) errs['bank_details.confirm_account_number'] = 'Account numbers do not match.';
    if (!bank.ifsc_code || bank.ifsc_code.length !== 11) errs['bank_details.ifsc_code'] = 'IFSC code must be 11 characters.';
    if (!data.documents?.bankProof?.url) errs['documents.bankProof'] = 'Please upload bank proof.';
  }

  if (step === 7) {
    if (!data.terms_agreed) errs.terms_agreed = 'Please confirm your information is correct.';
    if (!data.data_consent) errs.data_consent = 'Please provide your consent to continue.';
  }

  return errs;
};

const Signup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [uploading, setUploading] = useState({});

  const updateForm = useCallback((fields) => {
    setFormData((prev) => ({ ...prev, ...fields }));
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(fields).forEach((k) => {
        delete next[k];
        Object.keys(next).forEach((errKey) => {
          if (errKey.startsWith(`${k}.`)) delete next[errKey];
        });
      });
      return next;
    });
  }, []);

  const goToStep = (n) => {
    setStep(n);
    setErrors({});
    window.scrollTo(0, 0);
  };

  const handleNext = () => {
    const stepErrors = validateStep(step, formData);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStep(step + 1);
    window.scrollTo(0, 0);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setErrors({});
      window.scrollTo(0, 0);
    } else {
      navigate('/login');
    }
  };

  const handleSubmit = async () => {
    const stepErrors = validateStep(TOTAL_STEPS, formData);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        name: formData.full_name,
        email: formData.email,
        phone: formData.mobile_number,
        mobileNumber: formData.mobile_number,
        whatsappNumber: formData.mobile_number,
        password: formData.password,
        broker_code: formData.broker_code,
        dateOfBirth: formData.date_of_birth || undefined,
        gender: formData.gender,
        panNumber: formData.pan_number,
        aadharNumber: formData.aadhaar_number,
        occupation: formData.occupation,
        annual_income: formData.annual_income || undefined,
        // Always submit all segments (all are enabled for new accounts)
        segments_requested: ['EQUITY', 'F&O', 'COMMODITY', 'CURRENCY'],
        address: formData.address,
        bank_details: {
          bank_name: formData.bank_details?.bank_name || '',
          account_holder_name: formData.bank_details?.account_holder_name || '',
          account_number: formData.bank_details?.account_number || '',
          ifsc_code: formData.bank_details?.ifsc_code || '',
          account_type: formData.bank_details?.account_type || 'savings',
        },
        documents: formData.documents,
        terms_agreed: formData.terms_agreed,
        data_consent: formData.data_consent,
      };

      const res = await customerApi.submitRegistration(payload);
      const regId = res.registrationId;

      localStorage.setItem('wolf_registration_id', regId);
      navigate(`/registration-status/${regId}`);
    } catch (err) {
      setSubmitError(err?.response?.data?.message || err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isLastStep = step === TOTAL_STEPS;
  const anyUploading = Object.values(uploading).some(Boolean);

  const renderStep = () => {
    switch (step) {
      case 1: return <Step1BrokerCode data={formData} onUpdate={updateForm} />;
      case 2: return <Step2PersonalInfo data={formData} onUpdate={updateForm} errors={errors} />;
      case 3: return <Step3ContactAddress data={formData} onUpdate={updateForm} errors={errors} />;
      case 4: return <Step4Security data={formData} onUpdate={updateForm} errors={errors} />;
      case 5: return <Step5Documents data={formData} onUpdate={updateForm} uploading={uploading} setUploading={setUploading} errors={errors} />;
      case 6: return <Step6BankDetails data={formData} onUpdate={updateForm} uploading={uploading} setUploading={setUploading} errors={errors} />;
      case 7: return <Step6Review data={formData} onUpdate={updateForm} onGoToStep={goToStep} />;
      default: return null;
    }
  };

  const firstError = Object.values(errors)[0];

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-white w-full max-w-md mx-auto">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 z-10">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between">
          <button
            onClick={handleBack}
            className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[#111418] text-[20px] sm:text-[22px]">arrow_back_ios_new</span>
          </button>
          <h2 className="text-[#111418] text-sm sm:text-base font-bold leading-tight tracking-tight flex-1 text-center pr-8 sm:pr-9">
            Open Demat Account
          </h2>
        </div>
        <StepProgress currentStep={step} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
        {renderStep()}

        {firstError && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-xl text-xs">
            <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">error</span>
            <span>{firstError}</span>
          </div>
        )}

        {submitError && (
          <div className="mt-3 flex items-start gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-xl text-xs">
            <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">error</span>
            <span>{submitError}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 sm:px-5 py-3 pb-5 sm:pb-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={isLastStep ? handleSubmit : handleNext}
          disabled={submitting || anyUploading}
          className="w-full h-10 sm:h-11 rounded-xl bg-[#137fec] hover:bg-[#137fec]/90 disabled:bg-[#137fec]/60 text-white text-sm sm:text-base font-bold transition-all active:scale-[0.98] flex items-center justify-center"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Submitting...
            </>
          ) : anyUploading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Uploading...
            </>
          ) : isLastStep ? (
            'Submit Application'
          ) : (
            'Continue'
          )}
        </button>

        {step === 1 && (
          <p className="text-[11px] sm:text-xs text-gray-400 text-center">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="font-semibold text-[#137fec]">Login</button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Signup;
