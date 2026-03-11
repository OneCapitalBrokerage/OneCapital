import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';

const quickAmounts = [1000, 5000, 10000, 25000, 50000];

const AddFunds = () => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [utrNumber, setUtrNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 100) {
      setError('Minimum add-funds amount is ₹100.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await customerApi.requestAddFunds({
        amount: parsedAmount,
        utr_number: utrNumber.trim() || undefined,
      });
      navigate('/funds/add/confirm', {
        state: {
          amount: parsedAmount,
          request: response.request,
          paymentInfo: response.paymentInfo,
        },
      });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create add-funds request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806]">
      <TopHeader title="Add Funds" showBack={true} />

      <div className="px-4 py-5 space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-semibold text-gray-500 dark:text-[#9cb7aa] uppercase">Enter Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-gray-400 dark:text-[#6f8b7f]">₹</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full pl-10 pr-4 py-5 text-3xl font-bold bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-2xl text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary outline-none text-center"
            />
          </div>
          <p className="text-[11px] text-[#617589]">Funds are requested via UPI only.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(amt.toString())}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                amount === amt.toString()
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-[#0b120f] text-gray-600 dark:text-[#9cb7aa]'
              }`}
            >
              ₹{amt.toLocaleString('en-IN')}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">qr_code_2</span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-[#e8f3ee]">UPI Payment</p>
              <p className="text-xs text-[#617589]">Proceed to generate request and pay via UPI.</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500 dark:text-[#9cb7aa]">UTR / Transaction ID (optional)</label>
          <input
            type="text"
            value={utrNumber}
            onChange={(e) => setUtrNumber(e.target.value)}
            placeholder="Enter UTR or reference number"
            className="w-full px-4 py-3 bg-white dark:bg-[#111b17] border border-gray-200 dark:border-[#22352d] rounded-xl text-gray-900 dark:text-[#e8f3ee] text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-xl p-3 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !amount}
          className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50"
        >
          {loading ? 'Creating Request...' : 'Proceed to Pay'}
        </button>
      </div>
    </div>
  );
};

export default AddFunds;
