import { useState, useEffect, useRef } from 'react';
import customerApi from '../../../api/customer';

const Step1BrokerCode = ({ data, onUpdate }) => {
  const [code, setCode] = useState(data.broker_code || '');
  const [status, setStatus] = useState(data.broker_id ? 'valid' : 'idle'); // idle | checking | valid | invalid
  const [brokerInfo, setBrokerInfo] = useState(
    data.broker_id ? { broker_name: data.broker_name, city: data.broker_city } : null
  );
  const debounceRef = useRef(null);

  const validate = async (val) => {
    const trimmed = val.trim().toUpperCase();
    if (!trimmed) {
      setStatus('idle');
      setBrokerInfo(null);
      onUpdate({ broker_code: '', broker_id: null, broker_name: '', broker_city: '' });
      return;
    }
    setStatus('checking');
    try {
      const res = await customerApi.verifyBrokerCode(trimmed);
      if (res.valid) {
        setStatus('valid');
        setBrokerInfo(res);
        onUpdate({
          broker_code: trimmed,
          broker_id: res.broker_id,
          broker_name: res.broker_name,
          broker_city: res.city,
        });
      } else {
        setStatus('invalid');
        setBrokerInfo(null);
        onUpdate({ broker_code: trimmed, broker_id: null, broker_name: '', broker_city: '' });
      }
    } catch {
      setStatus('invalid');
      setBrokerInfo(null);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setCode(val);
    clearTimeout(debounceRef.current);
    if (val.length >= 4) {
      debounceRef.current = setTimeout(() => validate(val), 600);
    } else {
      setStatus('idle');
      setBrokerInfo(null);
      onUpdate({ broker_code: val, broker_id: null, broker_name: '', broker_city: '' });
    }
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[#111418] text-base sm:text-lg font-bold">Enter Reference Code</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">
          Your registration will be sent directly to your broker for review and account activation.
          Get this code from your broker or your reference.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[#111418] text-xs sm:text-sm font-medium">
          Reference Code <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 material-symbols-outlined text-[18px]">store</span>
          <input
            type="text"
            value={code}
            onChange={handleChange}
            maxLength={15}
            className={`w-full rounded-xl border h-10 sm:h-11 pl-10 pr-10 text-sm font-mono tracking-widest outline-none transition-all placeholder:font-sans placeholder:tracking-normal ${
              status === 'valid' ? 'border-green-500 focus:ring-1 focus:ring-green-500 bg-green-50' :
              status === 'invalid' ? 'border-red-400 focus:ring-1 focus:ring-red-400' :
              'border-[#dbe0e6] focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] bg-white'
            }`}
            placeholder="e.g. OCAP0001"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {status === 'checking' && (
              <span className="material-symbols-outlined text-[18px] text-gray-400 animate-spin">progress_activity</span>
            )}
            {status === 'valid' && (
              <span className="material-symbols-outlined text-[18px] text-green-500">check_circle</span>
            )}
            {status === 'invalid' && (
              <span className="material-symbols-outlined text-[18px] text-red-400">cancel</span>
            )}
          </span>
        </div>

        {status === 'valid' && brokerInfo && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 mt-1">
            <span className="material-symbols-outlined text-green-600 text-[20px]">verified</span>
            <div>
              <p className="text-green-700 text-sm font-semibold">{brokerInfo.broker_name}</p>
              {brokerInfo.city && <p className="text-green-600 text-[11px]">{brokerInfo.city}</p>}
            </div>
          </div>
        )}
        {status === 'invalid' && (
          <p className="text-red-500 text-[11px] mt-0.5">
            Invalid reference code. Please verify the code with your broker.
          </p>
        )}
        {status === 'idle' && (
          <p className="text-gray-400 text-[11px] mt-0.5">
            Enter your reference code or broker ID. Both are accepted.
          </p>
        )}
      </div>

      {/* Why it's required */}
      <div className="bg-[#f6f7f8] rounded-xl p-3 flex gap-2.5 mt-1">
        <span className="material-symbols-outlined text-[#617589] text-[18px] shrink-0 mt-0.5">info</span>
        <div className="flex flex-col gap-1">
          <p className="text-[#111418] text-xs font-semibold">Why is this required?</p>
          <p className="text-[#617589] text-[11px] leading-relaxed">
            Your application goes directly to your broker's panel. Without a valid code, your
            registration cannot be processed. Contact your broker if you don't have a code.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Step1BrokerCode;
