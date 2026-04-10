import { useCallback, useEffect, useMemo, useState } from 'react';
import brokerApi from '../../api/broker';

const DEFAULT_OPTION_CHAIN_PERCENT = 10;
const MANUAL_DEPOSIT_METHODS = [
  { key: 'upi', label: 'UPI' },
  { key: 'imps', label: 'IMPS' },
  { key: 'neft', label: 'NEFT' },
  { key: 'rtgs', label: 'RTGS' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'cash', label: 'Cash' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'internal', label: 'Internal' },
  { key: 'other', label: 'Other' },
];

const MANUAL_WITHDRAWAL_METHODS = [
  { key: 'upi', label: 'UPI' },
  { key: 'imps', label: 'IMPS' },
  { key: 'neft', label: 'NEFT' },
  { key: 'rtgs', label: 'RTGS' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'internal', label: 'Internal' },
  { key: 'other', label: 'Other' },
];

const getDefaultPaidAt = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const clampNonNegative = (value) => Math.max(0, toNumber(value));

const formatCurrency = (value) =>
  `₹${clampNonNegative(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const mapBalance = (response) => {
  const data = response?.data || response || {};
  const funds = data.funds || {};
  const balance = data.balance || {};

  // depositedCash = pure deposits (net_available_balance), pnlBalance = realized P&L
  const depositedCash = clampNonNegative(
    funds.depositedCash ?? data.depositedCash ?? funds.availableCash ?? balance.availableCash ?? balance.net ?? data.availableCash
  );
  const pnlBalance = toNumber(funds.pnlBalance ?? data.pnlBalance ?? 0);
  const intradayAvailable = clampNonNegative(
    funds.intradayAvailable ?? balance.intraday?.available ?? data.intradayAvailable
  );
  const intradayUsed = clampNonNegative(
    funds.intradayUsed ?? balance.intraday?.used ?? data.intradayUsed
  );
  const longTermAvailable = clampNonNegative(
    funds.longTermAvailable ?? balance.overnight?.available ?? data.longTermAvailable
  );
  const openingBalance = intradayAvailable + longTermAvailable;
  const optionChainLimit = clampNonNegative(
    funds.optionChainLimit ??
      balance.optionChain?.limit ??
      (openingBalance * (funds.optionChainLimitPercent ?? balance.optionChain?.percentage ?? DEFAULT_OPTION_CHAIN_PERCENT)) / 100
  );
  const optionChainLimitPercent = clampNonNegative(
    funds.optionChainLimitPercent ?? balance.optionChain?.percentage ?? DEFAULT_OPTION_CHAIN_PERCENT
  );

  const commodityDeliveryAvailable = clampNonNegative(
    funds.commodityDeliveryAvailable ?? balance.commodityDelivery?.available ?? data.commodityDeliveryAvailable
  );
  const commodityDeliveryUsed = clampNonNegative(
    funds.commodityDeliveryUsed ?? balance.commodityDelivery?.used ?? data.commodityDeliveryUsed
  );
  const commodityIntradayAvailable = clampNonNegative(
    funds.commodityIntradayAvailable ?? balance.commodityIntraday?.available ?? data.commodityIntradayAvailable
  );
  const commodityIntradayUsed = clampNonNegative(
    funds.commodityIntradayUsed ?? balance.commodityIntraday?.used ?? data.commodityIntradayUsed
  );
  const commodityOptionLimitPercent = clampNonNegative(
    funds.commodityOptionLimitPercent ?? balance.commodityOption?.percentage ?? DEFAULT_OPTION_CHAIN_PERCENT
  );

  return {
    depositedCash,
    pnlBalance,
    openingBalance,
    intradayAvailable,
    intradayUsed,
    longTermAvailable,
    optionChainLimit,
    optionChainLimitPercent,
    commodityDeliveryAvailable,
    commodityDeliveryUsed,
    commodityIntradayAvailable,
    commodityIntradayUsed,
    commodityOptionLimitPercent,
  };
};

const Funds = () => {
  const [clients, setClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualDepositSaving, setManualDepositSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [note, setNote] = useState('');
  const [manualDepositForm, setManualDepositForm] = useState({
    amount: '',
    method: 'upi',
    paidAt: getDefaultPaidAt(),
    reference: '',
    notes: '',
  });
  const [manualWithdrawalForm, setManualWithdrawalForm] = useState({
    amount: '',
    method: 'bank_transfer',
    paidAt: getDefaultPaidAt(),
    reference: '',
    notes: '',
  });
  const [manualDeposits, setManualDeposits] = useState([]);
  const [manualWithdrawals, setManualWithdrawals] = useState([]);
  const [manualDepositsLoading, setManualDepositsLoading] = useState(false);
  const [manualWithdrawalsLoading, setManualWithdrawalsLoading] = useState(false);
  const [selectedClientWithdrawable, setSelectedClientWithdrawable] = useState(0);
  const [form, setForm] = useState({
    depositedCash: '',
    intradayAvailable: '',
    longTermAvailable: '',
    optionLimitPercentage: '',
    commodityDeliveryAvailable: '',
    commodityIntradayAvailable: '',
    commodityOptionLimitPercentage: '',
  });
  const [baseline, setBaseline] = useState(null);

  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const response = await brokerApi.getAllClients({ limit: 200 });
      setClients(response.clients || response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch clients');
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const loadClientFunds = useCallback(async (client) => {
    setLoadingBalance(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await brokerApi.getClientBalance(client.id || client._id);
      const snapshot = mapBalance(response);
      setBaseline(snapshot);
      setForm({
        depositedCash: String(snapshot.depositedCash),
        intradayAvailable: String(snapshot.intradayAvailable),
        longTermAvailable: String(snapshot.longTermAvailable),
        optionLimitPercentage: String(snapshot.optionChainLimitPercent),
        commodityDeliveryAvailable: String(snapshot.commodityDeliveryAvailable),
        commodityIntradayAvailable: String(snapshot.commodityIntradayAvailable),
        commodityOptionLimitPercentage: String(snapshot.commodityOptionLimitPercent),
      });
      setNote('');
    } catch (err) {
      setError(err.message || 'Failed to fetch client funds');
      setBaseline(null);
      setForm({
        depositedCash: '',
        intradayAvailable: '',
        longTermAvailable: '',
        optionLimitPercentage: '',
        commodityDeliveryAvailable: '',
        commodityIntradayAvailable: '',
        commodityOptionLimitPercentage: '',
      });
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const loadManualDeposits = useCallback(async (clientId) => {
    if (!clientId) {
      setManualDeposits([]);
      return;
    }

    setManualDepositsLoading(true);
    try {
      const response = await brokerApi.getManualDeposits({ customerId: clientId, limit: 15 });
      setManualDeposits(response?.deposits || []);
    } catch {
      setManualDeposits([]);
    } finally {
      setManualDepositsLoading(false);
    }
  }, []);

  const loadManualWithdrawals = useCallback(async (clientId) => {
    if (!clientId) {
      setManualWithdrawals([]);
      return;
    }

    setManualWithdrawalsLoading(true);
    try {
      const response = await brokerApi.getManualWithdrawals({ customerId: clientId, limit: 15 });
      setManualWithdrawals(response?.withdrawals || []);
    } catch {
      setManualWithdrawals([]);
    } finally {
      setManualWithdrawalsLoading(false);
    }
  }, []);

  const loadSelectedClientWithdrawable = useCallback(async (clientId) => {
    if (!clientId) {
      setSelectedClientWithdrawable(0);
      return;
    }

    try {
      const response = await brokerApi.getWithdrawalEligibility({ customerId: clientId });
      const row = Array.isArray(response?.clients) ? response.clients[0] : null;
      setSelectedClientWithdrawable(toNumber(row?.withdrawableNetCash));
    } catch {
      setSelectedClientWithdrawable(0);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => {
      const id = String(client.id || client._id || '').toLowerCase();
      const name = String(client.name || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [clients, searchQuery]);

  const computedOpeningBalance = useMemo(
    () => clampNonNegative(form.intradayAvailable) + clampNonNegative(form.longTermAvailable),
    [form.intradayAvailable, form.longTermAvailable]
  );

  const optionChainPreview = useMemo(() => {
    const optionPercent = clampNonNegative(form.optionLimitPercentage);
    return Number(((computedOpeningBalance * optionPercent) / 100).toFixed(2));
  }, [computedOpeningBalance, form.optionLimitPercentage]);

  const commodityOptionPreview = useMemo(() => {
    const pct = clampNonNegative(form.commodityOptionLimitPercentage);
    const commodityBase = clampNonNegative(form.commodityIntradayAvailable) + clampNonNegative(form.commodityDeliveryAvailable);
    return Number(((commodityBase * pct) / 100).toFixed(2));
  }, [form.commodityIntradayAvailable, form.commodityDeliveryAvailable, form.commodityOptionLimitPercentage]);

  const hasChanges = useMemo(() => {
    if (!baseline) return false;
    return (
      clampNonNegative(form.depositedCash) !== baseline.depositedCash ||
      clampNonNegative(form.intradayAvailable) !== baseline.intradayAvailable ||
      clampNonNegative(form.longTermAvailable) !== baseline.longTermAvailable ||
      clampNonNegative(form.optionLimitPercentage) !== baseline.optionChainLimitPercent ||
      clampNonNegative(form.commodityDeliveryAvailable) !== baseline.commodityDeliveryAvailable ||
      clampNonNegative(form.commodityIntradayAvailable) !== baseline.commodityIntradayAvailable ||
      clampNonNegative(form.commodityOptionLimitPercentage) !== baseline.commodityOptionLimitPercent
    );
  }, [form, baseline]);

  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    const clientId = client.id || client._id;
    await Promise.all([
      loadClientFunds(client),
      loadManualDeposits(clientId),
      loadManualWithdrawals(clientId),
      loadSelectedClientWithdrawable(clientId),
    ]);
  };

  const handleFieldChange = (key, value) => {
    setError(null);
    setSuccess(null);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    if (!baseline) return;
    setForm({
      depositedCash: String(baseline.depositedCash),
      intradayAvailable: String(baseline.intradayAvailable),
      longTermAvailable: String(baseline.longTermAvailable),
      optionLimitPercentage: String(baseline.optionChainLimitPercent),
      commodityDeliveryAvailable: String(baseline.commodityDeliveryAvailable),
      commodityIntradayAvailable: String(baseline.commodityIntradayAvailable),
      commodityOptionLimitPercentage: String(baseline.commodityOptionLimitPercent),
    });
    setNote('');
    resetManualDepositForm();
    resetManualWithdrawalForm();
    setSelectedClientWithdrawable(0);
    setError(null);
    setSuccess(null);
  };

  const handleManualDepositFieldChange = (key, value) => {
    setManualDepositForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetManualDepositForm = () => {
    setManualDepositForm({
      amount: '',
      method: 'upi',
      paidAt: getDefaultPaidAt(),
      reference: '',
      notes: '',
    });
  };

  const handleManualWithdrawalFieldChange = (key, value) => {
    setManualWithdrawalForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetManualWithdrawalForm = () => {
    setManualWithdrawalForm({
      amount: '',
      method: 'bank_transfer',
      paidAt: getDefaultPaidAt(),
      reference: '',
      notes: '',
    });
  };

  const handleSave = async () => {
    if (!selectedClient) {
      setError('Select a client first.');
      return;
    }

    const payload = {
      depositedCash: clampNonNegative(form.depositedCash),
      intradayAvailable: clampNonNegative(form.intradayAvailable),
      longTermAvailable: clampNonNegative(form.longTermAvailable),
      optionLimitPercentage: clampNonNegative(form.optionLimitPercentage),
      commodityDeliveryAvailable: clampNonNegative(form.commodityDeliveryAvailable),
      commodityIntradayAvailable: clampNonNegative(form.commodityIntradayAvailable),
      commodityOptionLimitPercentage: clampNonNegative(form.commodityOptionLimitPercentage),
      note: note.trim(),
    };

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await brokerApi.updateClientFunds(selectedClient.id || selectedClient._id, payload);
      const nextSnapshot = mapBalance(response);
      setBaseline(nextSnapshot);
      setForm({
        depositedCash: String(nextSnapshot.depositedCash),
        intradayAvailable: String(nextSnapshot.intradayAvailable),
        longTermAvailable: String(nextSnapshot.longTermAvailable),
        optionLimitPercentage: String(nextSnapshot.optionChainLimitPercent),
        commodityDeliveryAvailable: String(nextSnapshot.commodityDeliveryAvailable),
        commodityIntradayAvailable: String(nextSnapshot.commodityIntradayAvailable),
        commodityOptionLimitPercentage: String(nextSnapshot.commodityOptionLimitPercent),
      });
      setNote('');
      setSuccess(`Funds updated for ${selectedClient.name || selectedClient.id}.`);
    } catch (err) {
      setError(err.message || 'Failed to update funds');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateManualDeposit = async () => {
    if (!selectedClient) {
      setError('Select a client first.');
      return;
    }

    const amount = toNumber(manualDepositForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid manual deposit amount.');
      return;
    }

    setManualDepositSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const clientId = selectedClient.id || selectedClient._id;
      await brokerApi.createManualDeposit(clientId, {
        amount,
        method: manualDepositForm.method,
        paidAt: manualDepositForm.paidAt ? new Date(manualDepositForm.paidAt).toISOString() : undefined,
        reference: manualDepositForm.reference,
        notes: manualDepositForm.notes,
      });

      await loadClientFunds(selectedClient);
      await loadManualDeposits(clientId);
      await loadManualWithdrawals(clientId);
      resetManualDepositForm();
      setSuccess(`Manual deposit recorded for ${selectedClient.name || clientId}.`);
    } catch (err) {
      setError(err.message || 'Failed to record manual deposit');
    } finally {
      setManualDepositSaving(false);
    }
  };

  const handleCreateManualWithdrawal = async () => {
    if (!selectedClient) {
      setError('Select a client first.');
      return;
    }

    const amount = toNumber(manualWithdrawalForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid manual withdrawal amount.');
      return;
    }

    setManualDepositSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const clientId = selectedClient.id || selectedClient._id;
      await brokerApi.createManualWithdrawal(clientId, {
        amount,
        method: manualWithdrawalForm.method,
        paidAt: manualWithdrawalForm.paidAt ? new Date(manualWithdrawalForm.paidAt).toISOString() : undefined,
        reference: manualWithdrawalForm.reference,
        notes: manualWithdrawalForm.notes,
      });

      await loadClientFunds(selectedClient);
      await Promise.all([
        loadManualDeposits(clientId),
        loadManualWithdrawals(clientId),
        loadSelectedClientWithdrawable(clientId),
      ]);
      resetManualWithdrawalForm();
      setSuccess(`Manual withdrawal recorded for ${selectedClient.name || clientId}.`);
    } catch (err) {
      setError(err.message || 'Failed to record manual withdrawal');
    } finally {
      setManualDepositSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7f8] pb-20">
      <div className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3">
          <h1 className="text-lg font-bold leading-tight sm:text-xl">Funds Management</h1>
          <span className="material-symbols-outlined text-[22px] text-[#617589]">account_balance_wallet</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-white p-3 sm:p-4">
          <p className="mb-2 text-xs font-medium text-[#617589]">Clients</p>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-[#f6f7f8] px-3 py-2.5">
            <span className="material-symbols-outlined text-[18px] text-[#617589]">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by client name or ID"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#617589]"
            />
          </div>

          {loadingClients ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[1, 2, 3, 4].map((idx) => (
                <div key={idx} className="h-20 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          ) : filteredClients.length === 0 ? (
            <p className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-[#617589]">
              No clients found.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filteredClients.map((client) => {
                const clientId = client.id || client._id;
                const isSelected = (selectedClient?.id || selectedClient?._id) === clientId;
                const initials = (client.name || '?')
                  .split(' ')
                  .filter(Boolean)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2);

                return (
                  <button
                    key={clientId}
                    onClick={() => handleSelectClient(client)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-[#137fec] bg-[#137fec]/5 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#137fec]/10 text-xs font-bold text-[#137fec]">
                        {initials || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#111418]">{client.name || 'Unknown Client'}</p>
                        <p className="truncate text-[11px] text-[#617589]">{clientId}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#617589]">
                          {client.status || 'active'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedClient && (
          <div className="mt-2 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#617589]">Selected Client</p>
                <h2 className="text-base font-bold text-[#111418]">{selectedClient.name || selectedClient.id}</h2>
                <p className="text-[11px] text-[#617589]">{selectedClient.id || selectedClient._id}</p>
              </div>
              <span className="rounded-full bg-[#137fec]/10 px-2 py-1 text-[10px] font-bold text-[#137fec]">Funds Editor</span>
            </div>

            {loadingBalance ? (
              <div className="space-y-2">
                <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
                <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Manual Deposit Entry</p>
                    <p className="mt-1 text-[11px] text-emerald-800">
                      Record customer payments received via WhatsApp. This creates a deposit transaction and credits deposited cash.
                    </p>

                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="rounded-lg border border-emerald-200 bg-white p-2.5 sm:col-span-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Amount</p>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={manualDepositForm.amount}
                          onChange={(e) => handleManualDepositFieldChange('amount', e.target.value)}
                          className="w-full bg-transparent text-base font-bold text-[#111418] outline-none"
                          placeholder="0.00"
                        />
                      </label>

                      <label className="rounded-lg border border-emerald-200 bg-white p-2.5">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Method</p>
                        <select
                          value={manualDepositForm.method}
                          onChange={(e) => handleManualDepositFieldChange('method', e.target.value)}
                          className="w-full bg-transparent text-sm font-semibold text-[#111418] outline-none"
                        >
                          {MANUAL_DEPOSIT_METHODS.map((method) => (
                            <option key={method.key} value={method.key}>{method.label}</option>
                          ))}
                        </select>
                      </label>

                      <label className="rounded-lg border border-emerald-200 bg-white p-2.5">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Paid At</p>
                        <input
                          type="datetime-local"
                          value={manualDepositForm.paidAt}
                          onChange={(e) => handleManualDepositFieldChange('paidAt', e.target.value)}
                          className="w-full bg-transparent text-sm font-semibold text-[#111418] outline-none"
                        />
                      </label>

                      <label className="rounded-lg border border-emerald-200 bg-white p-2.5 sm:col-span-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Reference (optional)</p>
                        <input
                          type="text"
                          value={manualDepositForm.reference}
                          onChange={(e) => handleManualDepositFieldChange('reference', e.target.value)}
                          className="w-full bg-transparent text-sm text-[#111418] outline-none"
                          placeholder="UTR / transfer reference"
                        />
                      </label>

                      <label className="rounded-lg border border-emerald-200 bg-white p-2.5 sm:col-span-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Notes (optional)</p>
                        <textarea
                          rows={2}
                          value={manualDepositForm.notes}
                          onChange={(e) => handleManualDepositFieldChange('notes', e.target.value)}
                          className="w-full resize-none bg-transparent text-sm text-[#111418] outline-none"
                          placeholder="Context for this deposit entry"
                        />
                      </label>
                    </div>

                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={resetManualDepositForm}
                        disabled={manualDepositSaving}
                        className="h-10 flex-1 rounded-lg border border-emerald-200 bg-white text-sm font-semibold text-[#111418] disabled:opacity-60"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateManualDeposit}
                        disabled={manualDepositSaving}
                        className="h-10 flex-[2] rounded-lg bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {manualDepositSaving ? 'Recording...' : 'Record Deposit'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Recent Manual Deposits</p>
                    {manualDepositsLoading ? (
                      <div className="mt-2 space-y-2 animate-pulse">
                        <div className="h-10 rounded bg-gray-100" />
                        <div className="h-10 rounded bg-gray-100" />
                      </div>
                    ) : manualDeposits.length === 0 ? (
                      <p className="mt-2 text-xs text-[#617589]">No manual deposit entries found.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {manualDeposits.slice(0, 5).map((entry) => (
                          <div key={entry.id || `${entry.paidAt}-${entry.amount}`} className="rounded-lg border border-gray-200 bg-[#f8fafc] px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-[#111418]">{formatCurrency(entry.amount)}</p>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                {entry.methodLabel || 'Manual'}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-[#617589]">
                              {formatDateTime(entry.paidAt)}
                              {entry.reference ? ` • Ref: ${entry.reference}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700">Manual Withdrawal Entry</p>
                    <p className="mt-1 text-[11px] text-red-700">
                      Record completed payout entries. Amount is debited from withdrawable net cash only.
                    </p>

                    <div className="mt-2 rounded-lg border border-red-200 bg-white px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-[#617589]">Withdrawable Net Cash</p>
                      <p className="text-[14px] font-bold text-[#111418] mt-0.5">{formatCurrency(selectedClientWithdrawable)}</p>
                    </div>

                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="rounded-lg border border-red-200 bg-white p-2.5 sm:col-span-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Amount</p>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={manualWithdrawalForm.amount}
                          onChange={(e) => handleManualWithdrawalFieldChange('amount', e.target.value)}
                          className="w-full bg-transparent text-base font-bold text-[#111418] outline-none"
                          placeholder="0.00"
                        />
                      </label>

                      <label className="rounded-lg border border-red-200 bg-white p-2.5">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Method</p>
                        <select
                          value={manualWithdrawalForm.method}
                          onChange={(e) => handleManualWithdrawalFieldChange('method', e.target.value)}
                          className="w-full bg-transparent text-sm font-semibold text-[#111418] outline-none"
                        >
                          {MANUAL_WITHDRAWAL_METHODS.map((method) => (
                            <option key={method.key} value={method.key}>{method.label}</option>
                          ))}
                        </select>
                      </label>

                      <label className="rounded-lg border border-red-200 bg-white p-2.5">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Paid At</p>
                        <input
                          type="datetime-local"
                          value={manualWithdrawalForm.paidAt}
                          onChange={(e) => handleManualWithdrawalFieldChange('paidAt', e.target.value)}
                          className="w-full bg-transparent text-sm font-semibold text-[#111418] outline-none"
                        />
                      </label>

                      <label className="rounded-lg border border-red-200 bg-white p-2.5 sm:col-span-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Reference (optional)</p>
                        <input
                          type="text"
                          value={manualWithdrawalForm.reference}
                          onChange={(e) => handleManualWithdrawalFieldChange('reference', e.target.value)}
                          className="w-full bg-transparent text-sm text-[#111418] outline-none"
                          placeholder="Payout / transfer reference"
                        />
                      </label>

                      <label className="rounded-lg border border-red-200 bg-white p-2.5 sm:col-span-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#617589]">Notes (optional)</p>
                        <textarea
                          rows={2}
                          value={manualWithdrawalForm.notes}
                          onChange={(e) => handleManualWithdrawalFieldChange('notes', e.target.value)}
                          className="w-full resize-none bg-transparent text-sm text-[#111418] outline-none"
                          placeholder="Context for this withdrawal entry"
                        />
                      </label>
                    </div>

                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={resetManualWithdrawalForm}
                        disabled={manualDepositSaving}
                        className="h-10 flex-1 rounded-lg border border-red-200 bg-white text-sm font-semibold text-[#111418] disabled:opacity-60"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateManualWithdrawal}
                        disabled={manualDepositSaving}
                        className="h-10 flex-[2] rounded-lg bg-red-600 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {manualDepositSaving ? 'Recording...' : 'Record Withdrawal'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Recent Manual Withdrawals</p>
                    {manualWithdrawalsLoading ? (
                      <div className="mt-2 space-y-2 animate-pulse">
                        <div className="h-10 rounded bg-gray-100" />
                        <div className="h-10 rounded bg-gray-100" />
                      </div>
                    ) : manualWithdrawals.length === 0 ? (
                      <p className="mt-2 text-xs text-[#617589]">No manual withdrawal entries found.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {manualWithdrawals.slice(0, 5).map((entry) => (
                          <div key={entry.id || `${entry.paidAt}-${entry.amount}`} className="rounded-lg border border-gray-200 bg-[#f8fafc] px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-[#111418]">{formatCurrency(entry.amount)}</p>
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                {entry.methodLabel || 'Withdrawal'}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-[#617589]">
                              {formatDateTime(entry.paidAt)}
                              {entry.reference ? ` • Ref: ${entry.reference}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="rounded-xl border border-gray-200 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Deposited Cash</p>
                    <input
                      type="number"
                      min="0"
                      value={form.depositedCash}
                      onChange={(e) => handleFieldChange('depositedCash', e.target.value)}
                      className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                    />
                  </label>

                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Net Cash / P&L</p>
                    <p className={`text-lg font-bold ${(baseline?.pnlBalance ?? 0) >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                      {(baseline?.pnlBalance ?? 0) >= 0 ? '+' : ''}
                      {formatCurrency(baseline?.pnlBalance ?? 0)}
                    </p>
                    <p className="text-[10px] text-[#617589]">Accumulated realized P&L (read-only)</p>
                  </div>

                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Opening Balance (Auto)</p>
                    <p className="text-lg font-bold text-[#111418]">{formatCurrency(computedOpeningBalance)}</p>
                    <p className="text-[10px] text-[#617589]">Intraday + delivery margin</p>
                  </div>

                  <label className="rounded-xl border border-gray-200 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Intraday Available Cash</p>
                    <input
                      type="number"
                      min="0"
                      value={form.intradayAvailable}
                      onChange={(e) => handleFieldChange('intradayAvailable', e.target.value)}
                      className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                    />
                  </label>

                  <label className="rounded-xl border border-gray-200 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Delivery Margin</p>
                    <input
                      type="number"
                      min="0"
                      value={form.longTermAvailable}
                      onChange={(e) => handleFieldChange('longTermAvailable', e.target.value)}
                      className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                    />
                  </label>

                  <label className="rounded-xl border border-gray-200 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Option Premium (%)</p>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.optionLimitPercentage}
                      onChange={(e) => handleFieldChange('optionLimitPercentage', e.target.value)}
                      className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                    />
                  </label>

                  <div className="rounded-xl border border-dashed border-[#137fec]/40 bg-[#137fec]/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Option Premium Limit (Auto)</p>
                    <p className="mt-1 text-lg font-bold text-[#137fec]">
                      {formatCurrency(optionChainPreview)}
                    </p>
                    <p className="text-[10px] text-[#617589]">
                      {clampNonNegative(form.optionLimitPercentage)}% of opening balance. Deducted from respective margin bucket.
                    </p>
                  </div>

                  <div className="col-span-1 mt-1 rounded-xl border border-amber-200 bg-amber-50/50 p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Commodities (MCX)</p>
                  </div>

                  <label className="rounded-xl border border-gray-200 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Commodities Intraday Margin</p>
                    <input
                      type="number"
                      min="0"
                      value={form.commodityIntradayAvailable}
                      onChange={(e) => handleFieldChange('commodityIntradayAvailable', e.target.value)}
                      className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                    />
                  </label>

                  <label className="rounded-xl border border-gray-200 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Commodities Delivery Margin</p>
                    <input
                      type="number"
                      min="0"
                      value={form.commodityDeliveryAvailable}
                      onChange={(e) => handleFieldChange('commodityDeliveryAvailable', e.target.value)}
                      className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                    />
                  </label>

                  <label className="rounded-xl border border-gray-200 p-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Commodities Option Premium (%)</p>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.commodityOptionLimitPercentage}
                      onChange={(e) => handleFieldChange('commodityOptionLimitPercentage', e.target.value)}
                      className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                    />
                  </label>

                  <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-50/50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Commodities Option Premium Limit (Auto)</p>
                    <p className="mt-1 text-lg font-bold text-amber-600">
                      {formatCurrency(commodityOptionPreview)}
                    </p>
                    <p className="text-[10px] text-[#617589]">
                      {clampNonNegative(form.commodityOptionLimitPercentage)}% of commodities intraday + delivery margin.
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-gray-200 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Update Note (optional)</p>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reason for this manual update"
                    className="w-full resize-none bg-transparent text-sm text-[#111418] outline-none placeholder:text-[#617589]"
                  />
                </div>

                <div className="mt-3 rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Current Snapshot</p>
                  <p className="mt-1 text-xs text-[#617589]">
                    Intraday Used: <span className="font-semibold text-[#111418]">{formatCurrency(baseline?.intradayUsed || 0)}</span>
                  </p>
                  <p className="text-xs text-[#617589]">
                    Existing Option Limit: <span className="font-semibold text-[#111418]">{formatCurrency(baseline?.optionChainLimit || 0)}</span>
                  </p>
                  <p className="text-xs text-[#617589]">
                    Existing Option %: <span className="font-semibold text-[#111418]">{clampNonNegative(baseline?.optionChainLimitPercent || 0)}%</span>
                  </p>
                  <p className="text-xs text-[#617589]">
                    Commodities Intraday Used: <span className="font-semibold text-[#111418]">{formatCurrency(baseline?.commodityIntradayUsed || 0)}</span>
                  </p>
                  <p className="text-xs text-[#617589]">
                    Commodities Delivery Used: <span className="font-semibold text-[#111418]">{formatCurrency(baseline?.commodityDeliveryUsed || 0)}</span>
                  </p>
                  <p className="text-xs text-[#617589]">
                    Commodities Option %: <span className="font-semibold text-[#111418]">{clampNonNegative(baseline?.commodityOptionLimitPercent || 0)}%</span>
                  </p>
                </div>

                <div className="mt-4 flex gap-2.5">
                  <button
                    onClick={handleReset}
                    disabled={(
                      !hasChanges
                      && !manualDepositForm.amount
                      && !manualDepositForm.reference
                      && !manualDepositForm.notes
                      && !manualWithdrawalForm.amount
                      && !manualWithdrawalForm.reference
                      && !manualWithdrawalForm.notes
                    ) || saving || manualDepositSaving}
                    className="h-11 flex-1 rounded-xl border border-gray-300 bg-white text-sm font-bold text-[#111418] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!hasChanges || saving || manualDepositSaving}
                    className="h-11 flex-[2] rounded-xl bg-[#137fec] text-sm font-bold text-white shadow-lg shadow-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {saving ? 'Saving...' : 'Save Funds'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mx-3 mt-3 rounded-xl border border-red-100 bg-red-50 p-3 sm:mx-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mx-3 mt-3 rounded-xl border border-green-100 bg-green-50 p-3 sm:mx-4">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Funds;
