import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';
import {
  PAYMENT_METHOD_LABELS,
  getAvailablePaymentMethods,
  hasBankTransferDetails,
} from '../../utils/paymentIntake';

const quickAmounts = [1000, 5000, 10000, 25000, 50000];
const PAYMENT_METHOD_META = {
  upi: {
    icon: 'qr_code_2',
    title: 'UPI',
    description: 'Scan the official broker QR code to pay instantly.',
  },
  bank_transfer: {
    icon: 'account_balance',
    title: 'Bank Transfer',
    description: 'Transfer directly to the broker\'s bank account.',
  },
};

const AddFunds = () => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [utrNumber, setUtrNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [paymentInfoLoading, setPaymentInfoLoading] = useState(true);
  const [paymentInfoError, setPaymentInfoError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadPaymentInfo = async () => {
      setPaymentInfoLoading(true);
      setPaymentInfoError('');
      try {
        const response = await customerApi.getPaymentInfo();
        if (!active) return;
        setPaymentInfo(response.paymentInfo || null);
      } catch (err) {
        if (!active) return;
        setPaymentInfo(null);
        setPaymentInfoError(err?.response?.data?.message || 'Unable to load broker payment details.');
      } finally {
        if (active) {
          setPaymentInfoLoading(false);
        }
      }
    };

    loadPaymentInfo();

    return () => {
      active = false;
    };
  }, []);

  const availablePaymentMethods = useMemo(
    () => getAvailablePaymentMethods(paymentInfo),
    [paymentInfo]
  );

  useEffect(() => {
    if (!availablePaymentMethods.length) {
      setPaymentMethod('');
      return;
    }

    if (!availablePaymentMethods.includes(paymentMethod)) {
      setPaymentMethod(availablePaymentMethods[0]);
    }
  }, [availablePaymentMethods, paymentMethod]);

  const handleSubmit = async () => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 100) {
      setError('Minimum add-funds amount is ₹100.');
      return;
    }

    if (!paymentMethod) {
      setError('No broker payment method is available right now.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await customerApi.requestAddFunds({
        amount: parsedAmount,
        payment_method: paymentMethod,
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

  const bankTransferReady = hasBankTransferDetails(paymentInfo?.bankTransferDetails);
  const selectedMethodMeta = PAYMENT_METHOD_META[paymentMethod] || PAYMENT_METHOD_META.upi;

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
          <p className="text-[11px] text-[#617589]">Make sure to inform your broker about the transfer.</p>
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

        <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-white dark:bg-[#111b17] p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">{selectedMethodMeta.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-[#e8f3ee]">Transfer Method</p>
              <p className="text-xs text-[#617589]">{selectedMethodMeta.description}</p>
            </div>
          </div>

          {paymentInfoLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-10 rounded-xl bg-gray-100 dark:bg-[#16231d]" />
              <div className="h-16 rounded-xl bg-gray-100 dark:bg-[#16231d]" />
            </div>
          ) : paymentInfoError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {paymentInfoError}
            </div>
          ) : availablePaymentMethods.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              Broker payment instructions are not configured yet. Please contact support before creating the request.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {availablePaymentMethods.map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                      paymentMethod === method
                        ? 'bg-[#137fec] text-white'
                        : 'bg-gray-100 dark:bg-[#0b120f] text-[#617589] dark:text-[#9cb7aa]'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                ))}
              </div>

              {paymentMethod === 'upi' ? (
                <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#617589]">UPI Instructions</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-[#e8f3ee]">
                    Scan the official broker QR code on the next screen to complete the payment.
                  </p>
                </div>
              ) : paymentMethod === 'bank_transfer' && bankTransferReady ? (
                <div className="rounded-xl border border-gray-200 dark:border-[#22352d] bg-[#fafafa] dark:bg-[#0b120f] px-3 py-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#617589]">Bank Transfer Instructions</p>
                  <div className="text-sm text-gray-900 dark:text-[#e8f3ee] space-y-1">
                    <p>{paymentInfo?.bankTransferDetails?.bankName || 'Bank Account'}</p>
                    <p className="font-mono">{paymentInfo?.bankTransferDetails?.accountNumber}</p>
                    <p className="font-mono">{paymentInfo?.bankTransferDetails?.ifscCode}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['RTGS', 'NEFT', 'IMPS'].map((label) => (
                      <span key={label} className="rounded-full bg-gray-100 dark:bg-[#16231d] px-2.5 py-1 text-[11px] font-semibold text-[#617589] dark:text-[#9cb7aa]">
                        {label}
                      </span>
                    ))}
                    <span className="text-[11px] text-[#617589] dark:text-[#9cb7aa] self-center">accepted</span>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-500 dark:text-[#9cb7aa]">UTR / Transaction ID/Customer Note (optional)</label>
          <input
            type="text"
            value={utrNumber}
            onChange={(e) => setUtrNumber(e.target.value)}
            placeholder="Enter UTR or any note for the broker"
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
          disabled={loading || !amount || paymentInfoLoading || !paymentMethod}
          className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg transition-all disabled:opacity-50"
        >
          {loading ? 'Creating Request...' : 'Proceed to Pay'}
        </button>
      </div>
    </div>
  );
};

export default AddFunds;
