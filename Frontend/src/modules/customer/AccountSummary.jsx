import { useState, useEffect, useCallback } from 'react';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';

const AccountSummary = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({
    openingBalance: 0,
    closingBalance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    realizedPnL: 0,
    brokerage: 0,
    taxes: 0,
    otherCharges: 0,
  });

  // Fetch account summary
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await customerApi.getAccountSummary();
      const data = response.summary || response.data || response;
      const funds = data.funds || {};
      const portfolio = data.portfolio || {};
      
      setSummary({
        openingBalance: funds.balance || 0,
        closingBalance: funds.balance || 0,
        totalDeposits: data.totalDeposits || 0,
        totalWithdrawals: data.totalWithdrawals || 0,
        realizedPnL: portfolio.pnl || data.pnl || 0,
        brokerage: data.brokerage || 0,
        taxes: data.taxes || 0,
        otherCharges: data.otherCharges || 0,
      });
    } catch (err) {
      console.error('Failed to fetch account summary:', err);
      setError(err.message || 'Failed to load account summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806]">
      <TopHeader title="Account Summary" showBack={true} />

      <div className="px-4 py-5 space-y-4">
        {loading ? (
          <>
            <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-white/30 rounded w-32 mb-2"></div>
              <div className="h-8 bg-white/30 rounded w-40"></div>
            </div>
            <div className="bg-white dark:bg-[#111b17] rounded-2xl p-4 border border-gray-100 dark:border-[#22352d] animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-32 mb-4"></div>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="h-4 bg-gray-200 rounded w-28"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                </div>
              ))}
            </div>
          </>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center">
            {error}
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-5 text-white">
              <p className="text-white/70 text-sm mb-1">Net P&L (This Month)</p>
              <p className="text-3xl font-bold tnum">₹{summary.realizedPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>

            <div className="bg-white dark:bg-[#111b17] rounded-2xl p-4 border border-gray-100 dark:border-[#22352d]">
              <h3 className="font-semibold text-gray-900 dark:text-[#e8f3ee] mb-4">Balance Summary</h3>
              <div className="space-y-3">
                {[
                  { label: 'Opening Balance', value: summary.openingBalance },
                  { label: 'Total Deposits', value: summary.totalDeposits, positive: true },
                  { label: 'Total Withdrawals', value: summary.totalWithdrawals, negative: true },
                  { label: 'Closing Balance', value: summary.closingBalance, bold: true },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-[#22352d] last:border-0">
                    <span className="text-gray-600 dark:text-[#9cb7aa]">{item.label}</span>
                    <span className={`font-semibold tnum ${item.positive ? 'text-green-500' : item.negative ? 'text-red-500' : 'text-gray-900 dark:text-[#e8f3ee]'} ${item.bold ? 'text-lg' : ''}`}>
                      {item.positive ? '+' : item.negative ? '-' : ''}₹{item.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#111b17] rounded-2xl p-4 border border-gray-100 dark:border-[#22352d]">
              <h3 className="font-semibold text-gray-900 dark:text-[#e8f3ee] mb-4">Charges & Fees</h3>
              <div className="space-y-3">
                {[
                  { label: 'Brokerage', value: summary.brokerage },
                  { label: 'Taxes (GST, STT)', value: summary.taxes },
                  { label: 'Other Charges', value: summary.otherCharges },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-[#22352d] last:border-0">
                    <span className="text-gray-600 dark:text-[#9cb7aa]">{item.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-[#e8f3ee] tnum">₹{item.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AccountSummary;
