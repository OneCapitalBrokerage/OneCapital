import { useCallback, useEffect, useMemo, useState } from 'react';
import brokerApi from '../../api/broker';

const MODULES = [
  {
    key: 'funds',
    title: 'Funds Manage',
    subtitle: 'Client funds and margin allocation',
    icon: 'account_balance_wallet',
    badge: 'Live',
  },
  {
    key: 'brokerage',
    title: 'Brokerage Manage',
    subtitle: 'Client-wise brokerage rules',
    icon: 'paid',
    badge: 'Per Client',
  },
  {
    key: 'spread',
    title: 'Spread Manage',
    subtitle: 'Client-wise segment spread rules',
    icon: 'stacked_line_chart',
    badge: 'Per Client',
  },
];

const DEFAULT_OPTION_CHAIN_PERCENT = 10;

const DEFAULT_BROKERAGE_FORM = {
  cashPercent: '',
  futurePercent: '',
  optionsPerLot: '',
};

const DEFAULT_SPREAD_FORM = {
  cash: '0',
  cash_mode: 'ABSOLUTE',
  future: '0',
  future_mode: 'ABSOLUTE',
  option: '0',
  option_mode: 'ABSOLUTE',
  mcx: '0',
  mcx_mode: 'ABSOLUTE',
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

const getClientId = (client) => String(client?.id || client?._id || '');

const getClientInitials = (name) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const mapBalance = (response) => {
  const data = response?.data || response || {};
  const funds = data.funds || {};
  const balance = data.balance || {};

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
  const optionChainLimitPercent = clampNonNegative(
    funds.optionChainLimitPercent ?? balance.optionChain?.percentage ?? DEFAULT_OPTION_CHAIN_PERCENT
  );
  const optionChainLimit = clampNonNegative(
    funds.optionChainLimit ??
      balance.optionChain?.limit ??
      (openingBalance * optionChainLimitPercent) / 100
  );
  const commodityDeliveryAvailable = clampNonNegative(
    funds.commodityDeliveryAvailable ?? balance.commodityDelivery?.available ?? data.commodityDeliveryAvailable
  );
  const commodityDeliveryUsed = clampNonNegative(
    funds.commodityDeliveryUsed ?? balance.commodityDelivery?.used ?? data.commodityDeliveryUsed
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
    commodityOptionLimitPercent,
  };
};

const normalizePricingResponse = (response) => {
  const pricing = response?.pricing || response?.data?.pricing || {};
  const brokerage = pricing?.brokerage || {};
  const spread = pricing?.spread || {};
  const legacyCashFutureBuy = brokerage.cashFutureBuy ?? brokerage.cash_future?.buy;
  const legacyCashFutureSell = brokerage.cashFutureSell ?? brokerage.cash_future?.sell;
  const legacyOptionsBuyPerLot = brokerage.optionsBuyPerLot ?? brokerage.options?.buy_per_lot;
  const legacyOptionsSellPerLot = brokerage.optionsSellPerLot ?? brokerage.options?.sell_per_lot;

  return {
    brokerage: {
      cashPercent: String(
        brokerage.cashPercent ??
          brokerage.cash?.percent ??
          legacyCashFutureBuy ??
          legacyCashFutureSell ??
          DEFAULT_BROKERAGE_FORM.cashPercent
      ),
      futurePercent: String(
        brokerage.futurePercent ??
          brokerage.future?.percent ??
          legacyCashFutureBuy ??
          legacyCashFutureSell ??
          DEFAULT_BROKERAGE_FORM.futurePercent
      ),
      optionsPerLot: String(
        brokerage.optionsPerLot ??
          brokerage.option?.per_lot ??
          brokerage.option?.perLot ??
          legacyOptionsBuyPerLot ??
          legacyOptionsSellPerLot ??
          DEFAULT_BROKERAGE_FORM.optionsPerLot
      ),
    },
    spread: {
      cash: String(spread.cash ?? DEFAULT_SPREAD_FORM.cash),
      cash_mode: spread.cash_mode === 'PERCENT' ? 'PERCENT' : 'ABSOLUTE',
      future: String(spread.future ?? DEFAULT_SPREAD_FORM.future),
      future_mode: spread.future_mode === 'PERCENT' ? 'PERCENT' : 'ABSOLUTE',
      option: String(spread.option ?? DEFAULT_SPREAD_FORM.option),
      option_mode: spread.option_mode === 'PERCENT' ? 'PERCENT' : 'ABSOLUTE',
      mcx: String(spread.mcx ?? DEFAULT_SPREAD_FORM.mcx),
      mcx_mode: spread.mcx_mode === 'PERCENT' ? 'PERCENT' : 'ABSOLUTE',
    },
  };
};

const Management = () => {
  const [activeModule, setActiveModule] = useState(null);
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [note, setNote] = useState('');

  const [fundBaseline, setFundBaseline] = useState(null);
  const [fundForm, setFundForm] = useState({
    depositedCash: '',
    intradayAvailable: '',
    longTermAvailable: '',
    optionLimitPercentage: '',
    commodityDeliveryAvailable: '',
    commodityOptionLimitPercentage: '',
  });

  const [pricingBaseline, setPricingBaseline] = useState({
    brokerage: DEFAULT_BROKERAGE_FORM,
    spread: DEFAULT_SPREAD_FORM,
  });
  const [brokerageForm, setBrokerageForm] = useState(DEFAULT_BROKERAGE_FORM);
  const [spreadForm, setSpreadForm] = useState(DEFAULT_SPREAD_FORM);

  const fetchClients = useCallback(async () => {
    setLoadingClients(true);
    setError(null);
    try {
      const response = await brokerApi.getAllClients({ limit: 200 });
      setClients(response.clients || response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch clients');
    } finally {
      setLoadingClients(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) => {
      const id = getClientId(client).toLowerCase();
      const name = String(client.name || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [clients, searchQuery]);

  const selectedClientId = getClientId(selectedClient);

  const computedOpeningBalance = useMemo(
    () => clampNonNegative(fundForm.intradayAvailable) + clampNonNegative(fundForm.longTermAvailable),
    [fundForm.intradayAvailable, fundForm.longTermAvailable]
  );

  const optionChainPreview = useMemo(() => {
    const optionPercent = clampNonNegative(fundForm.optionLimitPercentage);
    return Number(((computedOpeningBalance * optionPercent) / 100).toFixed(2));
  }, [computedOpeningBalance, fundForm.optionLimitPercentage]);

  const commodityOptionPreview = useMemo(() => {
    const optionPercent = clampNonNegative(fundForm.commodityOptionLimitPercentage);
    const commodityBase = clampNonNegative(fundForm.commodityDeliveryAvailable);
    return Number(((commodityBase * optionPercent) / 100).toFixed(2));
  }, [fundForm.commodityDeliveryAvailable, fundForm.commodityOptionLimitPercentage]);

  const hasFundChanges = useMemo(() => {
    if (!fundBaseline) return false;
    return (
      clampNonNegative(fundForm.depositedCash) !== fundBaseline.depositedCash ||
      clampNonNegative(fundForm.intradayAvailable) !== fundBaseline.intradayAvailable ||
      clampNonNegative(fundForm.longTermAvailable) !== fundBaseline.longTermAvailable ||
      clampNonNegative(fundForm.optionLimitPercentage) !== fundBaseline.optionChainLimitPercent ||
      clampNonNegative(fundForm.commodityDeliveryAvailable) !== fundBaseline.commodityDeliveryAvailable ||
      clampNonNegative(fundForm.commodityOptionLimitPercentage) !== fundBaseline.commodityOptionLimitPercent
    );
  }, [fundForm, fundBaseline]);

  const hasBrokerageChanges = useMemo(() => {
    if (!selectedClientId) return false;
    return JSON.stringify(brokerageForm) !== JSON.stringify(pricingBaseline.brokerage);
  }, [brokerageForm, pricingBaseline.brokerage, selectedClientId]);

  const hasSpreadChanges = useMemo(() => {
    if (!selectedClientId) return false;
    return JSON.stringify(spreadForm) !== JSON.stringify(pricingBaseline.spread);
  }, [pricingBaseline.spread, selectedClientId, spreadForm]);

  const resetModuleContext = () => {
    setSelectedClient(null);
    setSearchQuery('');
    setFundBaseline(null);
    setFundForm({
      depositedCash: '',
      intradayAvailable: '',
      longTermAvailable: '',
      optionLimitPercentage: '',
      commodityDeliveryAvailable: '',
      commodityOptionLimitPercentage: '',
    });
    setPricingBaseline({
      brokerage: DEFAULT_BROKERAGE_FORM,
      spread: DEFAULT_SPREAD_FORM,
    });
    setBrokerageForm(DEFAULT_BROKERAGE_FORM);
    setSpreadForm(DEFAULT_SPREAD_FORM);
    setNote('');
    setError(null);
    setSuccess(null);
  };

  const openModule = (moduleKey) => {
    setActiveModule(moduleKey);
    resetModuleContext();
  };

  const closeModule = () => {
    setActiveModule(null);
    resetModuleContext();
  };

  const loadClientFunds = useCallback(async (client) => {
    setLoadingDetails(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await brokerApi.getClientBalance(getClientId(client));
      const snapshot = mapBalance(response);
      setFundBaseline(snapshot);
      setFundForm({
        depositedCash: String(snapshot.depositedCash),
        intradayAvailable: String(snapshot.intradayAvailable),
        longTermAvailable: String(snapshot.longTermAvailable),
        optionLimitPercentage: String(snapshot.optionChainLimitPercent),
        commodityDeliveryAvailable: String(snapshot.commodityDeliveryAvailable),
        commodityOptionLimitPercentage: String(snapshot.commodityOptionLimitPercent),
      });
      setNote('');
    } catch (err) {
      setError(err.message || 'Failed to fetch client funds');
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadClientPricing = useCallback(async (client) => {
    setLoadingDetails(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await brokerApi.getClientPricing(getClientId(client));
      const normalized = normalizePricingResponse(response);
      setPricingBaseline(normalized);
      setBrokerageForm(normalized.brokerage);
      setSpreadForm(normalized.spread);
    } catch (err) {
      setError(err.message || 'Failed to fetch client pricing');
      setPricingBaseline({
        brokerage: DEFAULT_BROKERAGE_FORM,
        spread: DEFAULT_SPREAD_FORM,
      });
      setBrokerageForm(DEFAULT_BROKERAGE_FORM);
      setSpreadForm(DEFAULT_SPREAD_FORM);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setError(null);
    setSuccess(null);

    if (activeModule === 'funds') {
      await loadClientFunds(client);
      return;
    }

    await loadClientPricing(client);
  };

  const handleSaveFunds = async () => {
    if (!selectedClient) {
      setError('Select a client first.');
      return;
    }
    const payload = {
      depositedCash: clampNonNegative(fundForm.depositedCash),
      intradayAvailable: clampNonNegative(fundForm.intradayAvailable),
      longTermAvailable: clampNonNegative(fundForm.longTermAvailable),
      optionLimitPercentage: clampNonNegative(fundForm.optionLimitPercentage),
      commodityDeliveryAvailable: clampNonNegative(fundForm.commodityDeliveryAvailable),
      commodityOptionLimitPercentage: clampNonNegative(fundForm.commodityOptionLimitPercentage),
      note: note.trim(),
    };

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await brokerApi.updateClientFunds(getClientId(selectedClient), payload);
      const nextSnapshot = mapBalance(response);
      setFundBaseline(nextSnapshot);
      setFundForm({
        depositedCash: String(nextSnapshot.depositedCash),
        intradayAvailable: String(nextSnapshot.intradayAvailable),
        longTermAvailable: String(nextSnapshot.longTermAvailable),
        optionLimitPercentage: String(nextSnapshot.optionChainLimitPercent),
        commodityDeliveryAvailable: String(nextSnapshot.commodityDeliveryAvailable),
        commodityOptionLimitPercentage: String(nextSnapshot.commodityOptionLimitPercent),
      });
      setNote('');
      setSuccess(`Funds updated for ${selectedClient.name || getClientId(selectedClient)}.`);
    } catch (err) {
      setError(err.message || 'Failed to update funds');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBrokerage = async () => {
    if (!selectedClient) {
      setError('Select a client first.');
      return;
    }

    const payload = {
      brokerage: {
        cashPercent: clampNonNegative(brokerageForm.cashPercent),
        futurePercent: clampNonNegative(brokerageForm.futurePercent),
        optionsPerLot: clampNonNegative(brokerageForm.optionsPerLot),
      },
    };

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await brokerApi.updateClientPricing(getClientId(selectedClient), payload);
      const normalized = normalizePricingResponse(response);
      setPricingBaseline(normalized);
      setBrokerageForm(normalized.brokerage);
      setSpreadForm(normalized.spread);
      setSuccess(`Brokerage updated for ${selectedClient.name || getClientId(selectedClient)}.`);
    } catch (err) {
      setError(err.message || 'Failed to update brokerage settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpread = async () => {
    if (!selectedClient) {
      setError('Select a client first.');
      return;
    }

    const payload = {
      spread: {
        cash: toNumber(spreadForm.cash),
        cash_mode: spreadForm.cash_mode || 'ABSOLUTE',
        future: toNumber(spreadForm.future),
        future_mode: spreadForm.future_mode || 'ABSOLUTE',
        option: toNumber(spreadForm.option),
        option_mode: spreadForm.option_mode || 'ABSOLUTE',
        mcx: toNumber(spreadForm.mcx),
        mcx_mode: spreadForm.mcx_mode || 'ABSOLUTE',
      },
    };

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await brokerApi.updateClientPricing(getClientId(selectedClient), payload);
      const normalized = normalizePricingResponse(response);
      setPricingBaseline(normalized);
      setBrokerageForm(normalized.brokerage);
      setSpreadForm(normalized.spread);
      setSuccess(`Spread updated for ${selectedClient.name || getClientId(selectedClient)}.`);
    } catch (err) {
      setError(err.message || 'Failed to update spread settings');
    } finally {
      setSaving(false);
    }
  };

  const moduleMeta = useMemo(
    () => MODULES.find((module) => module.key === activeModule),
    [activeModule]
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7f8] pb-20">
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2">
            {activeModule ? (
              <button
                onClick={closeModule}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#617589] hover:bg-gray-100"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
              </button>
            ) : null}
            <h1 className="text-lg font-bold leading-tight sm:text-xl">
              {activeModule ? `${moduleMeta?.title || 'Management'}` : 'Management'}
            </h1>
          </div>
          <span className="material-symbols-outlined text-[22px] text-[#617589]">
            {activeModule ? moduleMeta?.icon : 'tune'}
          </span>
        </div>
      </div>

      {!activeModule ? (
        <div className="p-3 sm:p-4">
          <p className="mb-3 rounded-xl border border-[#137fec]/20 bg-[#137fec]/5 px-3 py-2 text-xs text-[#2f5b84]">
            All configurations on this page are client-specific. No global apply.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {MODULES.map((module) => (
              <button
                key={module.key}
                onClick={() => openModule(module.key)}
                className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#137fec]/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#137fec]/10 text-[#137fec]">
                      <span className="material-symbols-outlined text-[22px]">{module.icon}</span>
                    </div>
                    <div>
                      <p className="text-base font-bold text-[#111418]">{module.title}</p>
                      <p className="text-xs text-[#617589]">{module.subtitle}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#137fec]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#137fec]">
                    {module.badge}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-white p-3 sm:p-4">
            <p className="mb-2 text-xs font-medium text-[#617589]">Clients</p>
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-[#f6f7f8] px-3 py-2.5">
              <span className="material-symbols-outlined text-[18px] text-[#617589]">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
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
                  const clientId = getClientId(client);
                  const isSelected = selectedClientId === clientId;

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
                          {getClientInitials(client.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#111418]">
                            {client.name || 'Unknown Client'}
                          </p>
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

          {selectedClient ? (
            <div className="mt-2 bg-white p-3 sm:p-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-[#617589]">Selected Client</p>
                  <h2 className="text-base font-bold text-[#111418]">{selectedClient.name || selectedClientId}</h2>
                  <p className="text-[11px] text-[#617589]">{selectedClientId}</p>
                </div>
                <span className="rounded-full bg-[#137fec]/10 px-2 py-1 text-[10px] font-bold text-[#137fec]">
                  Per-Client
                </span>
              </div>

              {loadingDetails ? (
                <div className="space-y-2">
                  <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
                  <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
                  <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
                </div>
              ) : (
                <>
                  {activeModule === 'funds' && (
                    <div className="grid grid-cols-1 gap-2.5">
                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Deposited Cash</p>
                        <input
                          type="number"
                          min="0"
                          value={fundForm.depositedCash}
                          onChange={(event) =>
                            setFundForm((prev) => ({ ...prev, depositedCash: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Net Cash / P&L</p>
                        <p className={`text-lg font-bold ${(fundBaseline?.pnlBalance ?? 0) >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                          {(fundBaseline?.pnlBalance ?? 0) >= 0 ? '+' : ''}
                          ₹{clampNonNegative(Math.abs(fundBaseline?.pnlBalance ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-[#617589]">Accumulated realized P&L (read-only)</p>
                      </div>

                      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Opening Balance (Auto)</p>
                        <p className="text-lg font-bold text-[#111418]">{formatCurrency(computedOpeningBalance)}</p>
                        <p className="text-[10px] text-[#617589]">Intraday + delivery margin</p>
                      </div>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Intraday Available</p>
                        <input
                          type="number"
                          min="0"
                          value={fundForm.intradayAvailable}
                          onChange={(event) =>
                            setFundForm((prev) => ({ ...prev, intradayAvailable: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Delivery Margin</p>
                        <input
                          type="number"
                          min="0"
                          value={fundForm.longTermAvailable}
                          onChange={(event) =>
                            setFundForm((prev) => ({ ...prev, longTermAvailable: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Option Premium (%)</p>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={fundForm.optionLimitPercentage}
                          onChange={(event) =>
                            setFundForm((prev) => ({ ...prev, optionLimitPercentage: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <div className="rounded-xl border border-dashed border-[#137fec]/40 bg-[#137fec]/5 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Option Premium Limit (Auto)</p>
                        <p className="mt-1 text-lg font-bold text-[#137fec]">{formatCurrency(optionChainPreview)}</p>
                        <p className="text-[10px] text-[#617589]">
                          {clampNonNegative(fundForm.optionLimitPercentage)}% of opening balance. Deducted from respective margin bucket.
                        </p>
                      </div>

                      <div className="col-span-1 mt-1 rounded-xl border border-amber-200 bg-amber-50/50 p-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Commodities (MCX)</p>
                      </div>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Commodities Delivery Margin</p>
                        <input
                          type="number"
                          min="0"
                          value={fundForm.commodityDeliveryAvailable}
                          onChange={(event) =>
                            setFundForm((prev) => ({ ...prev, commodityDeliveryAvailable: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Commodities Option Premium (%)</p>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={fundForm.commodityOptionLimitPercentage}
                          onChange={(event) =>
                            setFundForm((prev) => ({ ...prev, commodityOptionLimitPercentage: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-50/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Commodities Option Premium Limit (Auto)</p>
                        <p className="mt-1 text-lg font-bold text-amber-600">{formatCurrency(commodityOptionPreview)}</p>
                        <p className="text-[10px] text-[#617589]">
                          {clampNonNegative(fundForm.commodityOptionLimitPercentage)}% of commodities delivery margin.
                        </p>
                      </div>

                      <div className="rounded-xl bg-gray-50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Current Snapshot</p>
                        <p className="mt-1 text-xs text-[#617589]">
                          Intraday Used: <span className="font-semibold text-[#111418]">{formatCurrency(fundBaseline?.intradayUsed || 0)}</span>
                        </p>
                        <p className="text-xs text-[#617589]">
                          Existing Option Premium: <span className="font-semibold text-[#111418]">{formatCurrency(fundBaseline?.optionChainLimit || 0)}</span>
                        </p>
                        <p className="text-xs text-[#617589]">
                          Existing Option %: <span className="font-semibold text-[#111418]">{clampNonNegative(fundBaseline?.optionChainLimitPercent || 0)}%</span>
                        </p>
                        <p className="text-xs text-[#617589]">
                          Commodities Delivery Used: <span className="font-semibold text-[#111418]">{formatCurrency(fundBaseline?.commodityDeliveryUsed || 0)}</span>
                        </p>
                        <p className="text-xs text-[#617589]">
                          Commodities Option %: <span className="font-semibold text-[#111418]">{clampNonNegative(fundBaseline?.commodityOptionLimitPercent || 0)}%</span>
                        </p>
                      </div>

                      <div className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Update Note (optional)</p>
                        <textarea
                          rows={2}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Reason for this manual update"
                          className="w-full resize-none bg-transparent text-sm text-[#111418] outline-none placeholder:text-[#617589]"
                        />
                      </div>
                    </div>
                  )}

                  {activeModule === 'brokerage' && (
                    <div className="grid grid-cols-1 gap-2.5">
                      <div className="rounded-xl border border-dashed border-[#137fec]/30 bg-[#137fec]/5 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Brokerage Rule</p>
                        <p className="mt-1 text-xs text-[#111418]">Cash and futures use percentage on order value.</p>
                        <p className="text-xs text-[#111418]">Options use rupees per lot.</p>
                      </div>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Cash Brokerage (%)</p>
                        <input
                          type="number"
                          min="0"
                          value={brokerageForm.cashPercent}
                          onChange={(event) =>
                            setBrokerageForm((prev) => ({ ...prev, cashPercent: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Futures Brokerage (%)</p>
                        <input
                          type="number"
                          min="0"
                          value={brokerageForm.futurePercent}
                          onChange={(event) =>
                            setBrokerageForm((prev) => ({ ...prev, futurePercent: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>

                      <label className="rounded-xl border border-gray-200 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Options Brokerage (₹/Lot)</p>
                        <input
                          type="number"
                          min="0"
                          value={brokerageForm.optionsPerLot}
                          onChange={(event) =>
                            setBrokerageForm((prev) => ({ ...prev, optionsPerLot: event.target.value }))
                          }
                          className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                        />
                      </label>
                    </div>
                  )}

                  {activeModule === 'spread' && (
                    <div className="grid grid-cols-1 gap-2.5">
                      {[
                        { key: 'cash', label: 'Cash Spread' },
                        { key: 'future', label: 'Future Spread' },
                        { key: 'option', label: 'Option Spread' },
                        { key: 'mcx', label: 'MCX Spread' },
                      ].map(({ key, label }) => {
                        const modeKey = `${key}_mode`;
                        const isPercent = spreadForm[modeKey] === 'PERCENT';
                        return (
                          <div key={key} className="rounded-xl border border-gray-200 p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">
                                {label} ({isPercent ? '%' : '₹'})
                              </p>
                              <div className="flex rounded-lg bg-gray-100 p-0.5">
                                <button
                                  type="button"
                                  onClick={() => setSpreadForm((prev) => ({ ...prev, [modeKey]: 'ABSOLUTE' }))}
                                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
                                    !isPercent
                                      ? 'bg-white text-[#111418] shadow-sm'
                                      : 'text-[#617589]'
                                  }`}
                                >
                                  ₹ Flat
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSpreadForm((prev) => ({ ...prev, [modeKey]: 'PERCENT' }))}
                                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${
                                    isPercent
                                      ? 'bg-white text-[#111418] shadow-sm'
                                      : 'text-[#617589]'
                                  }`}
                                >
                                  % Price
                                </button>
                              </div>
                            </div>
                            <input
                              type="number"
                              value={spreadForm[key]}
                              onChange={(event) =>
                                setSpreadForm((prev) => ({ ...prev, [key]: event.target.value }))
                              }
                              className="w-full bg-transparent text-lg font-bold text-[#111418] outline-none"
                            />
                            {isPercent && (
                              <p className="mt-1 text-[10px] text-[#617589]">
                                Spread = market price × {toNumber(spreadForm[key])}%
                              </p>
                            )}
                          </div>
                        );
                      })}

                      <div className="rounded-xl border border-dashed border-[#137fec]/30 bg-[#137fec]/5 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#617589]">Execution Logic</p>
                        <p className="mt-1 text-xs text-[#111418]">BUY effective = market + spread</p>
                        <p className="text-xs text-[#111418]">SELL effective = market - spread</p>
                        <p className="mt-1 text-[10px] text-[#617589]">Flat: spread is fixed rupee amount. Percent: spread is derived from market price.</p>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="mt-3 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
                      {success}
                    </div>
                  )}

                  <div className="mt-4 flex gap-2.5">
                    <button
                      onClick={() => {
                        if (activeModule === 'funds' && fundBaseline) {
                          setFundForm({
                            depositedCash: String(fundBaseline.depositedCash),
                            intradayAvailable: String(fundBaseline.intradayAvailable),
                            longTermAvailable: String(fundBaseline.longTermAvailable),
                            optionLimitPercentage: String(fundBaseline.optionChainLimitPercent),
                            commodityDeliveryAvailable: String(fundBaseline.commodityDeliveryAvailable),
                            commodityOptionLimitPercentage: String(fundBaseline.commodityOptionLimitPercent),
                          });
                          setNote('');
                        }
                        if (activeModule === 'brokerage') setBrokerageForm(pricingBaseline.brokerage);
                        if (activeModule === 'spread') setSpreadForm(pricingBaseline.spread);
                        setError(null);
                        setSuccess(null);
                      }}
                      disabled={saving}
                      className="h-11 flex-1 rounded-xl border border-gray-300 bg-white text-sm font-bold text-[#111418] disabled:opacity-50"
                    >
                      Reset
                    </button>

                    <button
                      onClick={() => {
                        if (activeModule === 'funds') handleSaveFunds();
                        if (activeModule === 'brokerage') handleSaveBrokerage();
                        if (activeModule === 'spread') handleSaveSpread();
                      }}
                      disabled={
                        saving ||
                        (activeModule === 'funds' && !hasFundChanges) ||
                        (activeModule === 'brokerage' && !hasBrokerageChanges) ||
                        (activeModule === 'spread' && !hasSpreadChanges)
                      }
                      className="h-11 flex-[2] rounded-xl bg-[#137fec] text-sm font-bold text-white shadow-lg shadow-blue-500/20 disabled:bg-gray-300"
                    >
                      {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default Management;
