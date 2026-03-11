import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import customerApi from '../../api/customer';

const AddBankAccount = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    bank_name: '',
    account_number: '',
    confirm_account: '',
    ifsc_code: '',
    account_holder_name: '',
    account_type: 'savings',
  });

  // Pre-fill form when editing
  useEffect(() => {
    if (!isEdit) return;
    const loadAccount = async () => {
      try {
        const res = await customerApi.getBankAccounts();
        const acc = (res.accounts || []).find(a => a._id === id);
        if (acc) {
          setForm({
            bank_name: acc.bank_name || '',
            account_number: acc.account_number || '',
            confirm_account: acc.account_number || '',
            ifsc_code: acc.ifsc_code || '',
            account_holder_name: acc.account_holder_name || '',
            account_type: acc.account_type || 'savings',
          });
        }
      } catch (err) {
        setError('Failed to load account details');
      } finally {
        setLoading(false);
      }
    };
    loadAccount();
  }, [id, isEdit]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async () => {
    if (!form.bank_name || !form.account_number || !form.ifsc_code || !form.account_holder_name) {
      setError('All fields are required');
      return;
    }
    if (form.account_number !== form.confirm_account) {
      setError('Account numbers do not match');
      return;
    }
    if (form.ifsc_code.length !== 11) {
      setError('IFSC code must be 11 characters');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        bank_name: form.bank_name,
        account_number: form.account_number,
        ifsc_code: form.ifsc_code,
        account_holder_name: form.account_holder_name,
        account_type: form.account_type,
      };

      if (isEdit) {
        await customerApi.updateBankAccount(id, payload);
      } else {
        await customerApi.addBankAccount(payload);
      }
      navigate(-1);
    } catch (err) {
      setError(err.response?.data?.message || err.message || `Failed to ${isEdit ? 'update' : 'add'} bank account`);
    } finally {
      setSaving(false);
    }
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
        <h2 className="text-[#111418] dark:text-[#e8f3ee] text-[15px] sm:text-[17px] font-bold leading-tight">
          {isEdit ? 'Edit Bank Account' : 'Add Bank Account'}
        </h2>
        <div className="size-9 sm:size-10" />
      </div>

      {loading ? (
        <div className="px-3 sm:px-4 mt-4 flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-24 mb-1.5" />
              <div className="h-11 bg-gray-200 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 sm:px-4 mt-2 flex flex-col gap-3 sm:gap-4 pb-8">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[13px] sm:text-[14px] px-3 py-2.5 rounded-lg">
              {error}
            </div>
          )}

          {isEdit && (
            <div className="bg-yellow-50 dark:bg-amber-900/20 border border-yellow-200 dark:border-amber-900/30 text-yellow-800 dark:text-amber-300 text-[12px] sm:text-[13px] px-3 py-2.5 rounded-lg flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">info</span>
              <span>Editing bank details will reset your bank KYC verification. You'll need to re-submit bank proof after saving.</span>
            </div>
          )}

          {/* Bank Name */}
          <div>
            <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">Bank Name</label>
            <input
              type="text"
              value={form.bank_name}
              onChange={(e) => handleChange('bank_name', e.target.value)}
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
              value={form.account_number}
              onChange={(e) => handleChange('account_number', e.target.value.replace(/\D/g, ''))}
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
              value={form.confirm_account}
              onChange={(e) => handleChange('confirm_account', e.target.value.replace(/\D/g, ''))}
              placeholder="Re-enter account number"
              className="w-full h-11 sm:h-12 px-3 sm:px-4 bg-[#f6f7f8] dark:bg-[#16231d] border border-gray-200 dark:border-[#22352d] rounded-xl text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] focus:outline-none focus:border-[#137fec] dark:focus:border-[#10b981] transition-colors"
            />
          </div>

          {/* IFSC Code */}
          <div>
            <label className="text-[#617589] dark:text-[#9cb7aa] text-[12px] sm:text-[13px] font-medium mb-1 block">IFSC Code</label>
            <input
              type="text"
              value={form.ifsc_code}
              onChange={(e) => handleChange('ifsc_code', e.target.value.toUpperCase().slice(0, 11))}
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
              value={form.account_holder_name}
              onChange={(e) => handleChange('account_holder_name', e.target.value)}
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
                  onClick={() => handleChange('account_type', type)}
                  className={`flex-1 h-11 sm:h-12 rounded-xl text-[14px] sm:text-[15px] font-medium border transition-colors ${
                    form.account_type === type
                      ? 'bg-[#137fec] text-white border-[#137fec]'
                      : 'bg-[#f6f7f8] dark:bg-[#16231d] text-[#111418] dark:text-[#e8f3ee] border-gray-200 dark:border-[#22352d]'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-12 sm:h-14 bg-[#137fec] hover:bg-blue-600 text-white rounded-xl text-[15px] sm:text-[17px] font-semibold mt-4 transition-colors disabled:opacity-50"
          >
            {saving
              ? (isEdit ? 'Saving...' : 'Adding...')
              : (isEdit ? 'Save Changes' : 'Add Bank Account')
            }
          </button>
        </div>
      )}
    </div>
  );
};

export default AddBankAccount;
