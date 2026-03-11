import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const Margin = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [marginLoading, setMarginLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [transactionType, setTransactionType] = useState('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('NEFT / RTGS Transfer');

  const [currentMargin, setCurrentMargin] = useState(0);

  const quickAmounts = [10000, 25000, 50000, 100000];
  const reasons = ['NEFT / RTGS Transfer', 'Cheque Deposit', 'IMPS Transfer', 'Correction', 'Other'];

  const fetchClients = useCallback(async () => {
    try {
      const response = await brokerApi.getAllClients({ limit: 100 });
      setClients(response.clients || response.data || []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setSearchQuery(client.name || client.id);
    setShowDropdown(false);
    setError(null);
    setSuccess(null);

    setMarginLoading(true);
    try {
      const marginRes = await brokerApi.getClientMargin(client.id || client._id);
      const margin = marginRes.margin || marginRes.data || marginRes;
      setCurrentMargin(margin.currentMargin || margin.current_margin || margin.balance || 0);
    } catch (err) {
      console.error('Failed to fetch margin:', err);
      setCurrentMargin(0);
    } finally {
      setMarginLoading(false);
    }
  };

  const filteredClients = clients.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const id = (c.id || c._id || '').toLowerCase();
    return name.includes(q) || id.includes(q);
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value || 0);
  };

  const calculateNewMargin = () => {
    const amountValue = parseInt(amount) || 0;
    return transactionType === 'add' ? currentMargin + amountValue : currentMargin - amountValue;
  };

  const handleConfirm = async () => {
    if (!selectedClient) {
      setError('Please select a client');
      return;
    }
    if (!amount || parseInt(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await brokerApi.updateClientMargin(selectedClient.id || selectedClient._id, {
        type: transactionType,
        amount: parseInt(amount),
        reason
      });
      const newMargin = calculateNewMargin();
      setCurrentMargin(newMargin);
      setSuccess(`Margin ${transactionType === 'add' ? 'added' : 'withdrawn'}: ${formatCurrency(parseInt(amount))}`);
      setAmount('');
    } catch (err) {
      setError(err.message || 'Failed to update margin');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 justify-between border-b border-gray-200">
        <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
        </button>
        <h2 className="text-base sm:text-lg font-bold">Manage Margin</h2>
        <div className="size-9 sm:size-10"></div>
      </div>

      <div className="flex-1 flex flex-col gap-3 p-3 sm:p-4 pb-6 overflow-y-auto">
        {/* Client Search */}
        <div className="relative">
          <div className="flex items-center bg-white rounded-xl shadow-sm h-11 px-3 border border-gray-200">
            <span className="material-symbols-outlined text-[#617589] text-[20px]">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); setSelectedClient(null); }}
              onFocus={() => setShowDropdown(true)}
              className="w-full bg-transparent border-none text-sm placeholder:text-[#617589] outline-none ml-2"
              placeholder="Search Client ID (e.g. AB1234)"
            />
          </div>
          {showDropdown && searchQuery && filteredClients.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white rounded-xl shadow-lg border border-gray-200 mt-1 max-h-48 overflow-y-auto z-10">
              {filteredClients.slice(0, 10).map(client => {
                const cid = client.id || client._id;
                return (
                  <button
                    key={cid}
                    onClick={() => handleSelectClient(client)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#137fec]/10 flex items-center justify-center shrink-0">
                      <span className="text-[#137fec] text-[10px] font-bold">
                        {(client.name || '?').split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{client.name}</p>
                      <p className="text-[10px] text-[#617589]">{cid}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Client Info Card */}
        {selectedClient && (
          <div className="flex items-center gap-3 rounded-xl bg-white p-3 sm:p-4 shadow-sm border border-gray-100">
            <div className="w-12 h-12 rounded-full border-2 border-[#137fec]/20 bg-[#137fec]/10 flex items-center justify-center shrink-0">
              <span className="text-[#137fec] text-sm font-bold">
                {(selectedClient.name || '?').split(' ').map(n => n[0]).join('')}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{selectedClient.name}</p>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600">{selectedClient.id || selectedClient._id}</span>
              </div>
              <p className="text-[#617589] text-xs">Current Margin</p>
              {marginLoading ? (
                <div className="h-6 bg-gray-200 rounded w-28 animate-pulse mt-0.5"></div>
              ) : (
                <p className="text-lg font-bold">{formatCurrency(currentMargin)}</p>
              )}
            </div>
          </div>
        )}

        {/* Transaction Type */}
        <div className="flex h-11 items-center justify-center rounded-xl bg-gray-200 p-1">
          <label className={`flex cursor-pointer h-full grow items-center justify-center rounded-lg transition-all ${transactionType === 'add' ? 'bg-white shadow-sm' : ''}`}>
            <input type="radio" name="type" value="add" checked={transactionType === 'add'} onChange={() => setTransactionType('add')} className="hidden" />
            <span className={`text-xs font-bold ${transactionType === 'add' ? 'text-[#137fec]' : 'text-gray-500'}`}>Add Funds</span>
          </label>
          <label className={`flex cursor-pointer h-full grow items-center justify-center rounded-lg transition-all ${transactionType === 'withdraw' ? 'bg-white shadow-sm' : ''}`}>
            <input type="radio" name="type" value="withdraw" checked={transactionType === 'withdraw'} onChange={() => setTransactionType('withdraw')} className="hidden" />
            <span className={`text-xs font-bold ${transactionType === 'withdraw' ? 'text-[#137fec]' : 'text-gray-500'}`}>Withdraw Funds</span>
          </label>
        </div>

        {/* Amount Input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">Amount (INR)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold">₹</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); setSuccess(null); }}
              className="w-full rounded-xl border border-gray-300 bg-white h-12 pl-9 pr-4 text-lg font-bold shadow-sm outline-none focus:ring-2 focus:ring-[#137fec] placeholder:text-gray-400"
              placeholder="0"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {quickAmounts.map(value => (
              <button
                key={value}
                onClick={() => setAmount(prev => String((parseInt(prev) || 0) + value))}
                className="shrink-0 rounded-full border border-[#137fec]/30 bg-[#137fec]/10 px-3 py-1.5 text-xs font-medium text-[#137fec]"
              >
                + ₹{value >= 100000 ? `${value/100000}L` : value.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium">Reason</label>
          <div className="relative">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full appearance-none rounded-xl bg-white border border-gray-300 h-11 px-3 pr-10 text-sm shadow-sm outline-none focus:ring-2 focus:ring-[#137fec]"
            >
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
              <span className="material-symbols-outlined text-[18px]">expand_more</span>
            </div>
          </div>
        </div>

        {/* Calculation Summary */}
        {selectedClient && (
          <div className="rounded-xl bg-gray-100 p-3 flex flex-col gap-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">Current Margin</span>
              <span className="font-medium">{formatCurrency(currentMargin)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className={`font-medium flex items-center gap-1 ${transactionType === 'add' ? 'text-[#137fec]' : 'text-red-500'}`}>
                <span className="material-symbols-outlined text-[14px]">{transactionType === 'add' ? 'add_circle' : 'remove_circle'}</span>
                Adjustment
              </span>
              <span className={`font-bold ${transactionType === 'add' ? 'text-[#137fec]' : 'text-red-500'}`}>
                {transactionType === 'add' ? '+' : '-'} {formatCurrency(parseInt(amount) || 0)}
              </span>
            </div>
            <div className="h-px w-full bg-gray-300"></div>
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold">New Margin Balance</span>
              <span className="font-bold text-base">{formatCurrency(calculateNewMargin())}</span>
            </div>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500 text-[18px]">error</span>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
            <p className="text-green-600 text-sm">{success}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleConfirm}
          disabled={loading || !amount || parseInt(amount) <= 0 || !selectedClient}
          className="w-full rounded-xl bg-[#137fec] disabled:bg-gray-300 text-white font-bold h-12 text-sm shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
        >
          {loading ? 'Processing...' : 'Confirm Update'}
          {!loading && <span className="material-symbols-outlined text-[18px]">check</span>}
        </button>
      </div>
    </div>
  );
};

export default Margin;
