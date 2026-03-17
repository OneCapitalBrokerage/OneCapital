import { useCallback, useEffect, useMemo, useState } from 'react';
import brokerApi from '../../api/broker';

const DEFAULT_OPTION_CHAIN_PERCENT = 10;

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
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [note, setNote] = useState('');
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
    await loadClientFunds(client);
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
    setError(null);
    setSuccess(null);
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
                    disabled={!hasChanges || saving}
                    className="h-11 flex-1 rounded-xl border border-gray-300 bg-white text-sm font-bold text-[#111418] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
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
