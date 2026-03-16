import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import brokerApi from '../../api/broker';
import ModifyOrderSheet from '../customer/ModifyOrderSheet';
import OrderDetailSheet from '../customer/OrderDetailSheet';
import { resolveOrderPnl, getEffectiveEntryPrice } from '../../utils/calculateBrokerage';
import { useMarketData } from '../../context/SocketContext';
import customerApi from '../../api/customer';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const readNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatSignedMoney = (value) => {
  const n = Number(value || 0);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(n).toFixed(2)}`;
};

const formatSignedPct = (value) => {
  const n = Number(value || 0);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toFixed(2)}%`;
};

const getIstClockDate = (date = new Date()) => new Date(date.getTime() + IST_OFFSET_MS);

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getIstDateKey = (value) => {
  const parsed = parseDate(value);
  if (!parsed) return '';
  const istClock = getIstClockDate(parsed);
  const year = istClock.getUTCFullYear();
  const month = String(istClock.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istClock.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


const ClientDetail = () => {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const { ticksRef, subscribe, unsubscribe } = useMarketData();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState(null);
  const [actionConfirm, setActionConfirm] = useState(null);
  const [actionConfirmSubmitting, setActionConfirmSubmitting] = useState(false);
  const [actionConfirmError, setActionConfirmError] = useState(null);

  const [client, setClient] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [clientBalanceSummary, setClientBalanceSummary] = useState(null);

  // Order data states (fetched via impersonation)
  const [openOrders, setOpenOrders] = useState([]);
  const [holdingOrders, setHoldingOrders] = useState([]);
  const [closedOrders, setClosedOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Live price state
  const [livePrices, setLivePrices] = useState({});
  const subscribedTokensRef = useRef(new Set());
  const prevLivePricesRef = useRef({});

  // Sheet states
  const [modifyOrder, setModifyOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [detailTab, setDetailTab] = useState('open');

  // Impersonation token ref (set after login-as for API calls)
  const impersonationTokenRef = useRef(null);

  const fetchClientDetails = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const [clientRes, ledgerRes] = await Promise.all([
        brokerApi.getClientById(clientId),
        brokerApi.getClientLedger(clientId).catch(() => null)
      ]);

      setClient(clientRes.client || clientRes);
      setLedger(ledgerRes?.ledger || null);
    } catch (err) {
      console.error('Failed to fetch client details:', err);
      setError(err.message || 'Failed to load client details');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Fetch orders via broker impersonation
  const fetchOrders = useCallback(async () => {
    if (!clientId) return;
    setOrdersLoading(true);
    try {
      // Store current broker token, impersonate client, fetch, then restore
      const brokerToken = localStorage.getItem('accessToken');
      const brokerUser = localStorage.getItem('user');

      // Get impersonation token
      let token = impersonationTokenRef.current;
      if (!token) {
        const loginRes = await brokerApi.loginAsClient(clientId);
        token = loginRes.token;
        impersonationTokenRef.current = token;
      }

      // Temporarily set impersonation token
      localStorage.setItem('accessToken', token);

      try {
        const [ordersRes, holdingsRes, balanceRes] = await Promise.all([
          brokerApi.getClientOrders(clientId),
          brokerApi.getClientHoldingsOrders(clientId).catch(() => ({ holdings: [] })),
          customerApi.getBalance().catch(() => ({})),
        ]);

        const allOrders = ordersRes.orders || ordersRes.data || [];
        const holdingsData = holdingsRes.holdings || holdingsRes.data || [];
        const nextSummary = balanceRes?.summary || null;

        const mappedOrders = allOrders.map((order) => ({
          ...order,
          isOrderRecord: true,
          id: order.id || order._id,
          symbol: order.symbol,
          exchange: order.exchange || 'NSE',
          side: (order.side || '').toUpperCase(),
          quantity: toNumber(order.quantity),
          price: getEffectiveEntryPrice(order),
          effective_entry_price: getEffectiveEntryPrice(order),
          ltp: toNumber(order.ltp || order.last_price || order.price || 0),
          status: (order.status || order.order_status || '').toUpperCase(),
          product: (order.product || '').toUpperCase(),
          instrument_token: order.instrument_token,
          segment: order.segment,
          lots: order.lots,
          lot_size: order.lot_size,
          stop_loss: order.stop_loss || 0,
          target: order.target || 0,
          closed_ltp: toNumber(order.closed_ltp),
          exit_price: toNumber(order.exit_price),
          effective_exit_price: toNumber(order.effective_exit_price),
          brokerage: toNumber(order.brokerage),
          brokerage_breakdown: order.brokerage_breakdown || null,
          realized_pnl: readNumber(order.realized_pnl),
          settlement_status: order.settlement_status || null,
          closed_at: order.closed_at,
          exit_reason: order.exit_reason,
          came_From: order.came_From,
          jobbin_price: order.jobbin_price,
          exit_allowed: order.exit_allowed ?? false,
          validity_mode: order.validity_mode || null,
          validity_expires_at: order.validity_expires_at || null,
          validity_extended_count: order.validity_extended_count || 0,
          can_extend_validity: order.can_extend_validity ?? false,
          extend_validity_reason: order.extend_validity_reason || null,
          placedAt: order.placedAt || order.placed_at || order.createdAt,
        }));

        const hiddenStatuses = new Set(['CANCELLED', 'REJECTED']);
        const closedStatuses = new Set(['CLOSED', 'EXPIRED']);
        const longTermProducts = new Set(['CNC', 'NRML']);

        const open = mappedOrders.filter(
          (o) => o.product === 'MIS' && !closedStatuses.has(o.status) && !hiddenStatuses.has(o.status)
        );
        const closed = mappedOrders.filter((o) => closedStatuses.has(o.status));
        const holdOrders = mappedOrders.filter(
          (o) => longTermProducts.has(o.product) && !closedStatuses.has(o.status) && !hiddenStatuses.has(o.status)
        );

        const mappedHoldings = holdingsData.map((h) => ({
          ...h,
          isOrderRecord: false,
          id: h.id || h._id,
          symbol: h.symbol,
          exchange: h.exchange || 'NSE',
          side: (h.side || 'BUY').toUpperCase(),
          quantity: h.quantity,
          price: h.averagePrice || h.avg_price || 0,
          ltp: h.currentPrice ?? h.ltp ?? h.last_price ?? h.averagePrice ?? 0,
          status: 'HOLDING',
          product: (h.product || 'CNC').toUpperCase(),
          instrument_token: h.instrument_token,
          lots: h.lots,
          lot_size: h.lot_size,
        }));

        const orderIds = new Set(holdOrders.map((o) => o.id));
        const uniqueHoldings = mappedHoldings.filter((h) => !orderIds.has(h.id));
        const mergedHoldings = [...holdOrders, ...uniqueHoldings];

        setOpenOrders(open);
        setClosedOrders(closed);
        setHoldingOrders(mergedHoldings);
        setClientBalanceSummary(nextSummary);
      } finally {
        // Always restore broker token
        localStorage.setItem('accessToken', brokerToken);
        if (brokerUser) localStorage.setItem('user', brokerUser);
      }
    } catch (err) {
      console.error('Failed to fetch client orders:', err);
      setClientBalanceSummary(null);
    } finally {
      setOrdersLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchClientDetails();
  }, [fetchClientDetails]);

  useEffect(() => {
    if (client) fetchOrders();
  }, [client, fetchOrders]);

  // Live price subscription
  const liveTokens = useMemo(() => {
    const tokens = [...openOrders, ...holdingOrders]
      .map((order) => order.instrument_token || order.instrumentToken)
      .filter((token) => token != null && token !== '')
      .map((token) => String(token));
    return Array.from(new Set(tokens));
  }, [openOrders, holdingOrders]);

  useEffect(() => {
    const nextSet = new Set(liveTokens);
    const previousSet = subscribedTokensRef.current;
    const toSub = [];
    const toUnsub = [];

    nextSet.forEach((token) => {
      if (!previousSet.has(token)) toSub.push({ instrument_token: token });
    });
    previousSet.forEach((token) => {
      if (!nextSet.has(token)) toUnsub.push({ instrument_token: token });
    });

    if (toSub.length > 0) subscribe(toSub, 'quote');
    if (toUnsub.length > 0) unsubscribe(toUnsub, 'quote');
    subscribedTokensRef.current = nextSet;
  }, [liveTokens, subscribe, unsubscribe]);

  useEffect(() => {
    return () => {
      const tokens = Array.from(subscribedTokensRef.current).map((token) => ({
        instrument_token: token,
      }));
      if (tokens.length > 0) unsubscribe(tokens, 'quote');
    };
  }, [unsubscribe]);

  useEffect(() => {
    if (liveTokens.length === 0) {
      if (Object.keys(prevLivePricesRef.current).length > 0) {
        prevLivePricesRef.current = {};
        setLivePrices({});
      }
      return;
    }

    let animationFrameId;
    let lastUpdate = 0;
    const THROTTLE_MS = 33.33;

    const updateLoop = (timestamp) => {
      if (timestamp - lastUpdate < THROTTLE_MS) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }
      const next = {};
      liveTokens.forEach((token) => {
        const tick = ticksRef.current?.get(String(token));
        if (!tick) return;
        const ltp = tick.ltp ?? tick.last_price ?? tick.lastPrice ?? tick.close ?? null;
        if (ltp == null) return;
        next[String(token)] = Number(ltp);
      });

      const prev = prevLivePricesRef.current;
      const nextKeys = Object.keys(next);
      const prevKeys = Object.keys(prev);
      let hasChanges = nextKeys.length !== prevKeys.length;
      if (!hasChanges) {
        for (let i = 0; i < nextKeys.length; i += 1) {
          if (prev[nextKeys[i]] !== next[nextKeys[i]]) { hasChanges = true; break; }
        }
      }
      if (hasChanges) {
        prevLivePricesRef.current = next;
        setLivePrices(next);
      }
      lastUpdate = timestamp;
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [liveTokens, ticksRef]);

  const getDisplayLtp = useCallback((order, isClosed = false) => {
    if (isClosed) {
      return Number(order.effective_exit_price ?? order.closed_ltp ?? order.exit_price ?? order.ltp ?? order.price ?? 0);
    }
    const token = order.instrument_token || order.instrumentToken;
    if (token != null) {
      const liveLtp = livePrices[String(token)];
      if (liveLtp != null) return Number(liveLtp);
    }
    return Number(order.ltp ?? order.last_price ?? order.effective_entry_price ?? order.price ?? 0);
  }, [livePrices]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Broker API wrappers for shared sheets (runs under impersonation)
  const brokerUpdateOrder = useCallback(async (payload) => {
    const brokerToken = localStorage.getItem('accessToken');
    const brokerUser = localStorage.getItem('user');
    const token = impersonationTokenRef.current;
    if (!token) throw new Error('No impersonation token available');

    localStorage.setItem('accessToken', token);
    try {
      return await brokerApi.modifyClientOrder(payload);
    } finally {
      localStorage.setItem('accessToken', brokerToken);
      if (brokerUser) localStorage.setItem('user', brokerUser);
    }
  }, []);

  const brokerGetBalance = useCallback(async () => {
    const brokerToken = localStorage.getItem('accessToken');
    const brokerUser = localStorage.getItem('user');
    const token = impersonationTokenRef.current;
    if (!token) return { balance: {} };

    localStorage.setItem('accessToken', token);
    try {
      return await customerApi.getBalance();
    } finally {
      localStorage.setItem('accessToken', brokerToken);
      if (brokerUser) localStorage.setItem('user', brokerUser);
    }
  }, []);

  const closeActionConfirm = () => {
    if (actionConfirmSubmitting) return;
    setActionConfirm(null);
    setActionConfirmError(null);
  };

  const executeActionConfirm = async () => {
    if (!actionConfirm || !actionConfirm.order) return;

    setActionConfirmSubmitting(true);
    setActionConfirmError(null);

    try {
      if (actionConfirm.type === 'convert') {
        await brokerApi.convertOrderToHold(clientId, actionConfirm.order.id);
      } else if (actionConfirm.type === 'extend') {
        await brokerApi.extendOrderValidity(clientId, actionConfirm.order.id, {
          reason: 'Broker manual extension',
        });
      }

      await fetchOrders();
      setActionConfirm(null);
      setActionConfirmError(null);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Action failed';
      setActionConfirmError(message);
      console.error(`Failed to ${actionConfirm.type} action:`, err);
    } finally {
      setActionConfirmSubmitting(false);
    }
  };

  // Exit order handler (broker context)
  const handleExitOrder = async (order) => {
    if (!confirm(`Exit ${order.symbol} ${order.side} position for ${client?.name}?`)) return;

    const liveLtp = Number(order.ltp || order.price || 0);
    const closedLtp = Number(liveLtp.toFixed(4));

    try {
      await brokerUpdateOrder({
        order_id: order.id,
        instrument_token: order.instrument_token,
        symbol: order.symbol,
        side: order.side,
        product: order.product,
        segment: order.segment,
        lots: String(order.lots || 1),
        quantity: Number(order.quantity),
        order_status: 'CLOSED',
        status: 'CLOSED',
        closed_ltp: closedLtp,
        closed_at: new Date().toISOString(),
        exit_reason: 'manual',
        came_From: activeTab === 'positions' ? 'Open' : 'Hold',
        meta: { from: 'broker_ui_order_exit', broker_id: clientId },
      });
      fetchOrders();
    } catch (err) {
      console.error('Failed to exit order:', err);
      alert(err?.response?.data?.message || err.message || 'Failed to exit order');
    }
  };

  // Convert to Hold handler (broker-only)
  const handleConvertToHold = async (order) => {
    setActionConfirm({
      type: 'convert',
      order,
      icon: 'swap_horiz',
      iconBgClass: 'bg-amber-50',
      iconTextClass: 'text-amber-600',
      title: `Convert ${order.symbol} to Holdings?`,
      message: 'This will carry forward the intraday order into holdings (CNC) and apply delivery-side margin rules.',
      confirmLabel: 'Convert',
      confirmClass: 'bg-amber-500 hover:bg-amber-600',
      loadingLabel: 'Converting...',
    });
    setActionConfirmError(null);
  };

  // Extend Validity handler (broker-only, equity 7-day orders near expiry)
  const handleExtendValidity = async (order) => {
    setActionConfirm({
      type: 'extend',
      order,
      icon: 'update',
      iconBgClass: 'bg-blue-50',
      iconTextClass: 'text-[#137fec]',
      title: `Extend validity for ${order.symbol}?`,
      message: 'This will extend equity holdings validity by 7 calendar days.',
      confirmLabel: 'Extend +7 Days',
      confirmClass: 'bg-[#137fec] hover:bg-blue-600',
      loadingLabel: 'Extending...',
    });
    setActionConfirmError(null);
  };

  // Holdings correction handler (broker-only, silent)
  const handleAdjustHolding = async (order, payload) => {
    await brokerApi.adjustHolding(clientId, order.id, payload);
    await fetchOrders();
  };

  // Broker control handlers
  const handleBlock = async () => {
    setActionLoading(true);
    try {
      if (client.status === 'blocked') {
        await brokerApi.unblockClient(clientId);
        setClient(prev => ({ ...prev, status: 'active', tradingEnabled: true }));
      } else {
        await brokerApi.blockClient(clientId);
        setClient(prev => ({ ...prev, status: 'blocked', tradingEnabled: false }));
      }
    } catch (err) {
      console.error('Failed to toggle block:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleTrading = async () => {
    setActionLoading(true);
    try {
      const newEnabled = !client.tradingEnabled;
      await brokerApi.toggleTrading(clientId, newEnabled);
      setClient(prev => ({ ...prev, tradingEnabled: newEnabled }));
    } catch (err) {
      console.error('Failed to toggle trading:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleHoldingsExit = async () => {
    setActionLoading(true);
    try {
      const newAllowed = !client.holdingsExitAllowed;
      await brokerApi.toggleHoldingsExit(clientId, newAllowed);
      setClient(prev => ({ ...prev, holdingsExitAllowed: newAllowed }));
    } catch (err) {
      console.error('Failed to toggle holdings exit:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleOrderExit = async (order) => {
    const orderId = order.id;
    const newAllowed = !order.exit_allowed;
    // Optimistic update in both lists
    const patch = (list) => list.map((o) => o.id === orderId ? { ...o, exit_allowed: newAllowed } : o);
    setHoldingOrders(patch);
    setOpenOrders(patch);
    try {
      await brokerApi.toggleOrderExitAllowed(clientId, orderId, newAllowed);
    } catch (err) {
      // Revert on failure
      const revert = (list) => list.map((o) => o.id === orderId ? { ...o, exit_allowed: !newAllowed } : o);
      setHoldingOrders(revert);
      setOpenOrders(revert);
      console.error('Failed to toggle order exit:', err);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await brokerApi.deleteClient(clientId);
      navigate('/broker/clients');
    } catch (err) {
      console.error('Failed to delete client:', err);
    } finally {
      setActionLoading(false);
      setDeleteConfirm(false);
    }
  };

  const handleCredentials = async () => {
    try {
      const response = await brokerApi.getClientCredentials(clientId);
      setCredentialsModal(response.credentials || { id: clientId, password: '---' });
    } catch (err) {
      console.error('Failed to fetch credentials:', err);
    }
  };

  const handleLoginAsClient = async () => {
    setActionLoading(true);
    try {
      const response = await brokerApi.loginAsClient(clientId);
      if (response.token) {
        const currentToken = localStorage.getItem('accessToken');
        sessionStorage.setItem('brokerToken', currentToken);
        sessionStorage.setItem('brokerUser', localStorage.getItem('user'));

        localStorage.setItem('accessToken', response.token);
        localStorage.setItem('user', JSON.stringify({
          ...response.client,
          role: 'customer',
          isImpersonation: true
        }));

        window.location.href = '/watchlist';
      }
    } catch (err) {
      console.error('Failed to login as client:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSettlement = async () => {
    if (!client) return;
    const newEnabled = !client.settlementEnabled;
    setActionLoading(true);
    try {
      await brokerApi.setClientSettlement(clientId, newEnabled);
      setClient((prev) => ({ ...prev, settlementEnabled: newEnabled }));
    } catch (err) {
      console.error('Failed to toggle settlement:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleGlitch = async () => {
    if (!client) return;
    const newEnabled = !client.glitchEnabled;
    setActionLoading(true);
    try {
      await brokerApi.toggleGlitch(clientId, newEnabled);
      setClient((prev) => ({ ...prev, glitchEnabled: newEnabled }));
    } catch (err) {
      console.error('Failed to toggle glitch mode:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Overview metrics from order data
  const overviewMetrics = useMemo(() => {
    const totalOpenPnl = openOrders.reduce((sum, o) => {
      const ltp = getDisplayLtp(o, false);
      const pnl = resolveOrderPnl({ order: o, isClosed: false, ltp });
      return sum + pnl.netPnl;
    }, 0);

    const totalHoldingPnl = holdingOrders.reduce((sum, o) => {
      const ltp = getDisplayLtp(o, false);
      const pnl = resolveOrderPnl({ order: o, isClosed: false, ltp });
      return sum + pnl.netPnl;
    }, 0);

    const currentIstDateKey = getIstDateKey(new Date());
    const fallbackSessionBoundary = parseDate(clientBalanceSummary?.weekBoundaryStart);
    let fallbackSessionRealizedPnl = 0;
    let todayClosedPnl = 0;

    closedOrders.forEach((o) => {
      const ltp = getDisplayLtp(o, true);
      const pnl = resolveOrderPnl({ order: o, isClosed: true, ltp });
      const closedAt = parseDate(o.closed_at || o.exit_at || o.updatedAt || o.placedAt);
      if (getIstDateKey(closedAt) === currentIstDateKey) {
        todayClosedPnl += pnl.netPnl;
      }
      if (!fallbackSessionBoundary || (closedAt && closedAt >= fallbackSessionBoundary)) {
        fallbackSessionRealizedPnl += pnl.netPnl;
      }
    });

    const sessionRealizedPnl = toNumber(
      clientBalanceSummary?.realizedPnlThisWeek,
      fallbackSessionRealizedPnl
    );

    const holdCount = openOrders.filter(o => o.status === 'HOLD').length;

    return {
      openCount: openOrders.length,
      holdingCount: holdingOrders.length,
      closedCount: closedOrders.length,
      holdCount,
      totalOpenPnl,
      totalHoldingPnl,
      sessionRealizedPnl,
      todayClosedPnl,
    };
  }, [openOrders, holdingOrders, closedOrders, getDisplayLtp, clientBalanceSummary]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
        <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200">
          <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold flex-1 text-center">Client Details</h1>
          <div className="size-9 sm:size-10"></div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="size-20 rounded-full bg-gray-200"></div>
            <div className="h-5 bg-gray-200 rounded w-32"></div>
            <div className="h-4 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
        <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200">
          <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold flex-1 text-center">Client Details</h1>
          <div className="size-9 sm:size-10"></div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <span className="material-symbols-outlined text-[56px] text-red-300 mb-3">error</span>
          <p className="text-[#111418] text-base font-semibold mb-1">{error || 'Client not found'}</p>
          <button onClick={() => navigate('/broker/clients')} className="text-[#137fec] text-sm font-semibold mt-2">Back to Clients</button>
        </div>
      </div>
    );
  }

  const initials = client.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  const renderOrderCard = (order, tabKey) => {
    const isBuySide = order.side === 'BUY';
    const isClosed = false;
    const status = String(order.status || order.order_status || '').toUpperCase();
    const isPendingHolding =
      tabKey === 'holdings' &&
      ['PENDING', 'PENDING_APPROVAL', 'TRIGGER_PENDING', 'AMO'].includes(status);
    const canShowActions = !isPendingHolding && order.isOrderRecord !== false;

    const displayLtp = getDisplayLtp(order, isClosed);
    const pnlData = resolveOrderPnl({ order, isClosed, ltp: displayLtp });
    const isProfit = pnlData.netPnl >= 0;
    const pnlColor = isProfit ? 'text-[#078838]' : 'text-red-500';

    return (
      <div
        key={order.id}
        className="mb-1.5 sm:mb-2 rounded-xl bg-white border border-gray-100 overflow-hidden transition-all hover:border-[#cfe3f8]"
      >
        <div
          className="p-3 sm:p-4 cursor-pointer"
          onClick={() => { setDetailOrder({ ...order, ltp: displayLtp }); setDetailTab(tabKey === 'positions' ? 'open' : 'holdings'); }}
        >
          <div className="flex justify-between items-start">
            <div className="flex flex-col min-w-0 flex-1 pr-3 gap-0.5">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <p className="text-[#111418] text-sm font-semibold truncate">{order.symbol}</p>
                <span className="bg-gray-100 text-[#617589] text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">{order.exchange}</span>
                <span className={`text-[9px] sm:text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                  status === 'CLOSED'
                    ? 'bg-gray-100 text-gray-500'
                    : status.includes('PENDING')
                      ? 'bg-amber-50 text-amber-600'
                      : status === 'HOLD'
                        ? 'bg-purple-50 text-purple-600'
                        : 'bg-green-50 text-[#078838]'
                }`}>
                  {status}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[#617589] truncate">
                {order.product || '-'} · {order.segment || '-'}
              </p>
              <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-[#617589]">
                <span className={`font-medium px-1 sm:px-1.5 rounded text-[10px] sm:text-[11px] uppercase ${
                  isBuySide
                    ? 'text-[#137fec] bg-[#137fec]/10'
                    : 'text-red-500 bg-red-50'
                }`}>{order.side || '-'}</span>
                <span className="size-1 bg-gray-300 rounded-full"></span>
                <span>{order.quantity} Qty</span>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <p className="text-[#111418] text-sm font-bold tabular-nums">
                ₹{displayLtp?.toFixed(2)}
              </p>
              <span className={`text-[10px] sm:text-xs font-medium tabular-nums ${pnlColor}`}>
                {formatSignedMoney(pnlData.netPnl)} ({formatSignedPct(pnlData.pct)})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 text-[9px] sm:text-[10px]">
            <div className="flex flex-col rounded-lg bg-[#f6f7f8] px-2 py-1.5">
              <span className="text-[#7a8996] uppercase tracking-[0.04em] flex items-center gap-0.5">Avg <span className="material-symbols-outlined text-[11px] text-[#137fec]">edit</span></span>
              <span className="text-[#111418] font-medium tabular-nums">₹{order.price?.toFixed(2)}</span>
            </div>
            <div className="flex flex-col rounded-lg bg-[#f6f7f8] px-2 py-1.5">
              <span className="text-[#7a8996] uppercase tracking-[0.04em]">Qty</span>
              <span className="text-[#111418] font-medium tabular-nums">{order.quantity}</span>
            </div>
            <div className="flex flex-col rounded-lg bg-[#f6f7f8] px-2 py-1.5">
              <span className="text-[#7a8996] uppercase tracking-[0.04em]">Net P&L</span>
              <span className={`font-medium tabular-nums ${pnlColor}`}>{formatSignedMoney(pnlData.netPnl)}</span>
            </div>
          </div>

          {/* Validity info for longterm orders */}
          {order.validity_expires_at && order.validity_mode !== 'INTRADAY_DAY' && (
            <div className="flex items-center justify-between mt-2 text-[10px] sm:text-xs">
              <span className="text-[#617589] flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">schedule</span>
                Valid till
              </span>
              <span className={`font-medium ${
                new Date(order.validity_expires_at) <= new Date(Date.now() + 24 * 60 * 60 * 1000)
                  ? 'text-amber-600' : 'text-[#111418]'
              }`}>
                {new Date(order.validity_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                {order.validity_extended_count > 0 && (
                  <span className="ml-1 text-[9px] text-[#617589]">(+{order.validity_extended_count}x)</span>
                )}
              </span>
            </div>
          )}
        </div>

        {canShowActions && (
          <div className="border-t border-gray-100 px-3 sm:px-4 pt-2.5 pb-3.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5 w-full">
              <button
                onClick={(e) => { e.stopPropagation(); setModifyOrder({ ...order, ltp: displayLtp }); }}
                className="h-10 w-full px-3 text-center text-sm font-semibold text-white bg-[#137fec] hover:bg-[#0f6fcf] rounded-xl shadow-sm transition-colors"
              >
                Modify
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleExitOrder({ ...order, ltp: displayLtp }); }}
                className="h-10 w-full px-3 text-center text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-sm transition-colors"
              >
                Exit
              </button>
            </div>

            {/* Per-order customer exit toggle — only for holdings (CNC/NRML) */}
            {tabKey === 'holdings' && (
              <div
                className="flex items-center justify-between bg-[#f6f7f8] rounded-xl px-3 py-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-[16px] ${order.exit_allowed ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {order.exit_allowed ? 'lock_open' : 'lock'}
                  </span>
                  <span className="text-xs font-medium text-[#617589]">
                    {order.exit_allowed ? 'Customer can exit' : 'Customer exit locked'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleOrderExit(order)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${order.exit_allowed ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  role="switch"
                  aria-checked={order.exit_allowed}
                  title={order.exit_allowed ? 'Lock customer exit for this order' : 'Allow customer to exit this order'}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${order.exit_allowed ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            )}
          </div>
        )}
        {isPendingHolding && (
          <div className="px-3 py-2 text-[10px] sm:text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
            Pending holding order. Actions are disabled until execution.
          </div>
        )}
        {!isPendingHolding && order.isOrderRecord === false && (
          <div className="px-3 py-2 text-[10px] sm:text-xs text-[#617589] bg-gray-50 border-t border-gray-100">
            Aggregated holding record. Modify/Exit actions are available on active order entries only.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 justify-between border-b border-gray-200">
        <button
          onClick={() => navigate(-1)}
          className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 -ml-2"
        >
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
        </button>
        <h1 className="text-base sm:text-lg font-bold leading-tight flex-1 text-center">Client Details</h1>
        <div className="flex items-center gap-1 -mr-2">
          <button onClick={() => navigate(`/broker/clients/${clientId}/edit`)} className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">edit</span>
          </button>
          <button onClick={handleCredentials} className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">key</span>
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 sm:pb-8">
        {/* Client Header */}
        <section className="bg-white p-4 pb-2">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="relative">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#137fec]/10 flex items-center justify-center border-2 border-white shadow-sm">
                <span className="text-[#137fec] text-xl sm:text-2xl font-bold">{initials}</span>
              </div>
              {client.kycStatus === 'verified' && (
                <div className="absolute bottom-0 right-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-[12px] sm:text-[14px] font-bold">check</span>
                </div>
              )}
            </div>
            <div className="text-center">
              <h2 className="text-lg sm:text-xl font-bold leading-tight mb-1">{client.name}</h2>
              <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#617589] flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold uppercase ${
                  client.status === 'blocked' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>{client.status}</span>
                {client.blockedByAdmin && (
                  <span className="px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold uppercase bg-purple-100 text-purple-700">
                    Admin Suspended
                  </span>
                )}
                {!client.settlementEnabled && (
                  <span className="px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold uppercase bg-amber-100 text-amber-700">
                    Settlement Off
                  </span>
                )}
                <span>ID: {client.id || clientId}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Admin Suspension Banner */}
        {client.blockedByAdmin && (
          <section className="px-4 py-3">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-purple-600 text-[24px] shrink-0">admin_panel_settings</span>
              <div>
                <p className="text-purple-800 text-sm font-bold">Account Suspended by Admin</p>
                <p className="text-purple-600 text-xs mt-1">
                  {client.blockReason || 'This account has been suspended by an administrator.'}
                </p>
                <p className="text-purple-600 text-xs mt-1">Broker controls are disabled. Contact admin to restore access.</p>
              </div>
            </div>
          </section>
        )}

        {/* Action Buttons */}
        <section className="bg-white px-4 pb-4">
          <button
            onClick={handleLoginAsClient}
            disabled={actionLoading || client.status === 'blocked' || client.blockedByAdmin}
            className={`w-full flex items-center justify-center gap-2 h-11 sm:h-12 rounded-lg font-bold shadow-sm active:scale-[0.98] transition-all ${
              client.status === 'blocked' || client.blockedByAdmin ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#137fec] hover:bg-blue-600 text-white'
            }`}
            title={client.blockedByAdmin ? 'Account suspended by admin' : undefined}
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">login</span>
            <span className="text-sm sm:text-base">{actionLoading ? 'Loading...' : 'Login as Client'}</span>
          </button>

          {/* Broker Controls */}
          <div className={`mt-4 sm:mt-6 pt-4 border-t border-gray-100 ${client.blockedByAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
            <h3 className="text-[10px] sm:text-xs font-bold text-[#617589] uppercase tracking-wider mb-2 sm:mb-3 pl-1">
              Broker Controls
              {client.blockedByAdmin && <span className="ml-2 text-purple-600">(Admin suspended)</span>}
            </h3>
            <div className="flex flex-col gap-2 sm:gap-3">
              {/* Block Account Toggle */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="bg-white text-orange-600 p-2 rounded-full shadow-sm">
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">block</span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold">Block Account</p>
                    <p className="text-[10px] sm:text-xs text-[#617589]">Temporarily suspend access</p>
                  </div>
                </div>
                <div className="relative inline-block w-10 sm:w-11 h-5 sm:h-6 align-middle select-none">
                  <input
                    type="checkbox"
                    checked={client.status === 'blocked'}
                    onChange={handleBlock}
                    disabled={actionLoading || client.blockedByAdmin}
                    className="sr-only peer"
                    id="blockToggle"
                  />
                  <label
                    htmlFor="blockToggle"
                    className={`block overflow-hidden h-5 sm:h-6 rounded-full cursor-pointer transition-colors duration-200 ${
                      client.status === 'blocked' ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${
                      client.status === 'blocked' ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></span>
                  </label>
                </div>
              </div>

              {/* Stop Trading Toggle */}
              <div className={`flex items-center justify-between bg-gray-50 p-3 rounded-xl ${client.status === 'blocked' || client.blockedByAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="bg-white text-red-500 p-2 rounded-full shadow-sm">
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">do_not_disturb</span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold">Stop Trading</p>
                    <p className="text-[10px] sm:text-xs text-[#617589]">Disable order placement only</p>
                  </div>
                </div>
                <div className="relative inline-block w-10 sm:w-11 h-5 sm:h-6 align-middle select-none">
                  <input
                    type="checkbox"
                    checked={!client.tradingEnabled}
                    onChange={handleToggleTrading}
                    disabled={actionLoading || client.status === 'blocked' || client.blockedByAdmin}
                    className="sr-only peer"
                    id="tradingToggle"
                  />
                  <label
                    htmlFor="tradingToggle"
                    className={`block overflow-hidden h-5 sm:h-6 rounded-full cursor-pointer transition-colors duration-200 ${
                      !client.tradingEnabled ? 'bg-red-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${
                      !client.tradingEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></span>
                  </label>
                </div>
              </div>

              {/* Holdings Exit Toggle */}
              <div className={`flex items-center justify-between bg-gray-50 p-3 rounded-xl ${client.status === 'blocked' || client.blockedByAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`p-2 rounded-full shadow-sm bg-white ${client.holdingsExitAllowed ? 'text-emerald-600' : 'text-gray-400'}`}>
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                      {client.holdingsExitAllowed ? 'lock_open' : 'lock'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold">Holdings Exit</p>
                    <p className="text-[10px] sm:text-xs text-[#617589]">
                      {client.holdingsExitAllowed ? 'Customer can exit holdings' : 'Exit locked for customer'}
                    </p>
                  </div>
                </div>
                <div className="relative inline-block w-10 sm:w-11 h-5 sm:h-6 align-middle select-none">
                  <input
                    type="checkbox"
                    checked={!!client.holdingsExitAllowed}
                    onChange={handleToggleHoldingsExit}
                    disabled={actionLoading || client.status === 'blocked' || client.blockedByAdmin}
                    className="sr-only peer"
                    id="holdingsExitToggle"
                  />
                  <label
                    htmlFor="holdingsExitToggle"
                    className={`block overflow-hidden h-5 sm:h-6 rounded-full cursor-pointer transition-colors duration-200 ${
                      client.holdingsExitAllowed ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${
                      client.holdingsExitAllowed ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></span>
                  </label>
                </div>
              </div>

              {/* Settlement Toggle */}
              <div className={`flex items-center justify-between bg-gray-50 p-3 rounded-xl ${client.status === 'blocked' || client.blockedByAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`p-2 rounded-full shadow-sm bg-white ${client.settlementEnabled ? 'text-emerald-600' : 'text-amber-500'}`}>
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                      {client.settlementEnabled ? 'event_available' : 'event_busy'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold">Settlement</p>
                    <p className="text-[10px] sm:text-xs text-[#617589]">
                      {client.settlementEnabled ? 'Included in weekly settlement' : 'Excluded from settlement; P&L carries forward'}
                    </p>
                  </div>
                </div>
                <div className="relative inline-block w-10 sm:w-11 h-5 sm:h-6 align-middle select-none">
                  <input
                    type="checkbox"
                    id="settlementToggle"
                    checked={!!client.settlementEnabled}
                    onChange={handleToggleSettlement}
                    disabled={actionLoading || client.status === 'blocked' || client.blockedByAdmin}
                    className="sr-only peer"
                  />
                  <label
                    htmlFor="settlementToggle"
                    className={`block overflow-hidden h-5 sm:h-6 rounded-full cursor-pointer transition-colors duration-200 ${
                      client.settlementEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${
                      client.settlementEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></span>
                  </label>
                </div>
              </div>

              {/* Glitch Mode Toggle */}
              <div className={`flex items-center justify-between bg-gray-50 p-3 rounded-xl ${client.status === 'blocked' || client.blockedByAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`p-2 rounded-full shadow-sm bg-white ${client.glitchEnabled ? 'text-red-600' : 'text-gray-400'}`}>
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">bug_report</span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-bold">Glitch Mode</p>
                    <p className="text-[10px] sm:text-xs text-[#617589]">
                      {client.glitchEnabled ? 'Active — client views are distorted' : 'Inactive — client sees normal data'}
                    </p>
                  </div>
                </div>
                <div className="relative inline-block w-10 sm:w-11 h-5 sm:h-6 align-middle select-none">
                  <input
                    type="checkbox"
                    id="glitchToggle"
                    checked={!!client.glitchEnabled}
                    onChange={handleToggleGlitch}
                    disabled={actionLoading || client.status === 'blocked' || client.blockedByAdmin}
                    className="sr-only peer"
                  />
                  <label
                    htmlFor="glitchToggle"
                    className={`block overflow-hidden h-5 sm:h-6 rounded-full cursor-pointer transition-colors duration-200 ${
                      client.glitchEnabled ? 'bg-red-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-sm transform transition-transform duration-200 mt-0.5 ${
                      client.glitchEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}></span>
                  </label>
                </div>
              </div>

              {/* Delete Account */}
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full flex items-center justify-between bg-red-50 p-3 rounded-xl border border-red-100 group hover:bg-red-100 transition-colors active:scale-[0.99]"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="bg-white text-red-600 p-2 rounded-full shadow-sm border border-red-100">
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">delete_forever</span>
                  </div>
                  <div className="text-left">
                    <p className="text-xs sm:text-sm font-bold text-red-700">Delete Account</p>
                    <p className="text-[10px] sm:text-xs text-red-500/80">Requires confirmation</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-red-400 group-hover:text-red-600 transition-colors text-[18px] sm:text-[20px]">chevron_right</span>
              </button>
            </div>
          </div>
        </section>

        <div className="h-2"></div>

        {/* Tab Bar */}
        <div className="bg-white sticky top-[52px] z-40 border-b border-gray-200 shadow-sm">
          <div className="flex px-4 overflow-x-auto gap-4 sm:gap-6 no-scrollbar">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'positions', label: `Positions (${openOrders.length})` },
              { key: 'holdings', label: `Holdings (${holdingOrders.length})` },
              { key: 'ledger', label: 'Ledger' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-2.5 sm:pb-3 pt-2.5 sm:pt-3 border-b-2 text-xs sm:text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'border-[#137fec] text-[#137fec] font-bold'
                    : 'border-transparent text-[#617589] font-medium hover:text-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Order Health Summary */}
            <section className="px-3 sm:px-4 py-3">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h3 className="text-sm sm:text-base font-bold">Order Summary</h3>
                <button
                  onClick={fetchOrders}
                  disabled={ordersLoading}
                  className="flex items-center gap-1 text-[#137fec] text-xs font-semibold"
                >
                  <span className={`material-symbols-outlined text-[16px] ${ordersLoading ? 'animate-spin' : ''}`}>refresh</span>
                  Refresh
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 text-center">
                  <p className="text-[10px] text-[#617589] font-medium mb-0.5">Open</p>
                  <p className="text-lg font-bold text-[#111418]">{overviewMetrics.openCount}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 text-center">
                  <p className="text-[10px] text-[#617589] font-medium mb-0.5">Holdings</p>
                  <p className="text-lg font-bold text-[#111418]">{overviewMetrics.holdingCount}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 text-center">
                  <p className="text-[10px] text-[#617589] font-medium mb-0.5">On Hold</p>
                  <p className="text-lg font-bold text-[#111418]">{overviewMetrics.holdCount}</p>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 text-center">
                  <p className="text-[10px] text-[#617589] font-medium mb-0.5">Closed</p>
                  <p className="text-lg font-bold text-[#111418]">{overviewMetrics.closedCount}</p>
                </div>
              </div>
            </section>

            {/* P&L Summary */}
            <section className="px-3 sm:px-4 py-2">
              <h3 className="text-sm sm:text-base font-bold mb-2 sm:mb-3">P&L Summary</h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100">
                  <p className="text-[10px] sm:text-xs text-[#617589] font-medium mb-1">Open Positions P&L</p>
                  <p className={`text-base sm:text-lg font-bold tracking-tight ${overviewMetrics.totalOpenPnl >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                    {formatSignedMoney(overviewMetrics.totalOpenPnl)}
                  </p>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100">
                  <p className="text-[10px] sm:text-xs text-[#617589] font-medium mb-1">Holdings P&L</p>
                  <p className={`text-base sm:text-lg font-bold tracking-tight ${overviewMetrics.totalHoldingPnl >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                    {formatSignedMoney(overviewMetrics.totalHoldingPnl)}
                  </p>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100">
                  <p className="text-[10px] sm:text-xs text-[#617589] font-medium mb-1">This Session Realized P&L</p>
                  <p className={`text-base sm:text-lg font-bold tracking-tight ${overviewMetrics.sessionRealizedPnl >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                    {formatSignedMoney(overviewMetrics.sessionRealizedPnl)}
                  </p>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-lg shadow-sm border border-gray-100">
                  <p className="text-[10px] sm:text-xs text-[#617589] font-medium mb-1">Closed Today P&L</p>
                  <p className={`text-base sm:text-lg font-bold tracking-tight ${overviewMetrics.todayClosedPnl >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                    {formatSignedMoney(overviewMetrics.todayClosedPnl)}
                  </p>
                </div>
              </div>
            </section>

            {/* Funds Info */}
            {client.funds && (
              <section className="px-3 sm:px-4 py-2">
                <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                  <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-100">
                    <h3 className="text-sm sm:text-base font-bold">Funds & Margin</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {[
                      { label: 'Balance', value: formatCurrency(client.funds.balance) },
                      { label: 'Intraday Limit', value: formatCurrency(client.funds.intradayLimit) },
                      { label: 'Intraday Used', value: formatCurrency(client.funds.intradayUsed) },
                      { label: 'Delivery Margin', value: formatCurrency(client.funds.overnightLimit || client.funds.deliveryLimit) },
                      { label: 'Commodities Delivery Margin', value: formatCurrency(client.funds.commodityDeliveryLimit) },
                      { label: 'Commodities Delivery Used', value: formatCurrency(client.funds.commodityDeliveryUsed) },
                      { label: 'Commodities Option Premium', value: `${Number(client.funds.commodityOptionLimitPercent || 10).toFixed(2)}%` },
                    ].map(item => (
                      <div key={item.label} className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
                        <p className="text-xs sm:text-sm text-[#617589]">{item.label}</p>
                        <p className="text-xs sm:text-sm font-bold">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Client Details */}
            <section className="px-3 sm:px-4 py-2">
              <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-100">
                  <h3 className="text-sm sm:text-base font-bold">Client Details</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {[
                    { icon: 'mail', label: 'Email', value: client.email || '---' },
                    { icon: 'phone', label: 'Phone', value: client.phone || '---' },
                    { icon: 'calendar_today', label: 'Joined', value: client.joiningDate || '---' },
                    { icon: 'verified_user', label: 'KYC Status', value: client.kycStatus || 'pending' },
                    { icon: 'trending_up', label: 'Trading', value: client.tradingEnabled ? 'Enabled' : 'Disabled' },
                  ].map(item => (
                    <div key={item.label} className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#137fec]">
                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">{item.icon}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] sm:text-xs text-[#617589]">{item.label}</p>
                        <p className="text-xs sm:text-sm font-medium">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'positions' && (
          <section className="px-3 sm:px-4 py-3">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-sm sm:text-base font-bold">Open Positions ({openOrders.length})</h3>
              <button
                onClick={fetchOrders}
                disabled={ordersLoading}
                className="flex items-center gap-1 text-[#137fec] text-xs font-semibold"
              >
                <span className={`material-symbols-outlined text-[16px] ${ordersLoading ? 'animate-spin' : ''}`}>refresh</span>
                Refresh
              </button>
            </div>
            {ordersLoading && openOrders.length === 0 ? (
              <div className="pt-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="mb-1.5 sm:mb-2 rounded-xl bg-white border border-gray-100 p-3 sm:p-4 animate-pulse">
                    <div className="flex justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="h-4 bg-gray-200 rounded w-24"></div>
                        <div className="h-3 bg-gray-200 rounded w-32"></div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="h-4 bg-gray-200 rounded w-20"></div>
                        <div className="h-3 bg-gray-200 rounded w-16"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : openOrders.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <span className="material-symbols-outlined text-[48px] text-gray-300 mb-2">trending_flat</span>
                <p className="text-[#617589] text-sm">No open positions</p>
              </div>
            ) : (
              <div>
                {openOrders.map((order) => renderOrderCard(order, 'positions'))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'holdings' && (
          <section className="px-3 sm:px-4 py-3">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-sm sm:text-base font-bold">Holdings ({holdingOrders.length})</h3>
              <button
                onClick={fetchOrders}
                disabled={ordersLoading}
                className="flex items-center gap-1 text-[#137fec] text-xs font-semibold"
              >
                <span className={`material-symbols-outlined text-[16px] ${ordersLoading ? 'animate-spin' : ''}`}>refresh</span>
                Refresh
              </button>
            </div>
            {ordersLoading && holdingOrders.length === 0 ? (
              <div className="pt-1">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="mb-1.5 sm:mb-2 rounded-xl bg-white border border-gray-100 p-3 sm:p-4 animate-pulse">
                    <div className="flex justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="h-4 bg-gray-200 rounded w-24"></div>
                        <div className="h-3 bg-gray-200 rounded w-32"></div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="h-4 bg-gray-200 rounded w-20"></div>
                        <div className="h-3 bg-gray-200 rounded w-16"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : holdingOrders.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center">
                <span className="material-symbols-outlined text-[48px] text-gray-300 mb-2">inventory_2</span>
                <p className="text-[#617589] text-sm">No holdings</p>
              </div>
            ) : (
              <div>
                {holdingOrders.map((order) => renderOrderCard(order, 'holdings'))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'ledger' && (
          <section className="px-3 sm:px-4 py-3">
            <h3 className="text-sm sm:text-base font-bold mb-2 sm:mb-3">Ledger</h3>
            {!ledger ? (
              <div className="flex flex-col items-center py-12 text-center">
                <span className="material-symbols-outlined text-[48px] text-gray-300 mb-2">receipt_long</span>
                <p className="text-[#617589] text-sm">No ledger data available</p>
              </div>
            ) : (
              <>
                {/* Balance Summary */}
                <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-100 mb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-[#617589] font-medium mb-0.5">Balance</p>
                      <p className="text-base font-bold">{formatCurrency(ledger.currentBalance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#617589] font-medium mb-0.5">Intraday Available</p>
                      <p className="text-base font-bold">{formatCurrency(ledger.intraday?.available_limit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#617589] font-medium mb-0.5">Intraday Used</p>
                      <p className="text-base font-bold">{formatCurrency(ledger.intraday?.used_limit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#617589] font-medium mb-0.5">Delivery Available</p>
                      <p className="text-base font-bold">{formatCurrency(ledger.overnight?.available_limit)}</p>
                    </div>
                  </div>
                </div>

                {/* Recent Transactions */}
                <h4 className="text-xs font-bold text-[#617589] uppercase tracking-wider mb-2 px-1">Recent Transactions</h4>
                {(!ledger.recentTransactions || ledger.recentTransactions.length === 0) ? (
                  <p className="text-center text-[#617589] text-sm py-4">No recent transactions</p>
                ) : (
                  <div className="space-y-2">
                    {ledger.recentTransactions.map((tx, i) => (
                      <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-bold text-[#111418]">{tx.symbol || '---'}</p>
                          <p className="text-[10px] text-[#617589]">
                            <span className={tx.type === 'BUY' ? 'text-[#078838]' : 'text-red-500'}>{tx.type}</span>
                            &middot; Qty: {tx.quantity} &middot; @ {formatCurrency(tx.price)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold ${(tx.pnl || 0) >= 0 ? 'text-[#078838]' : 'text-red-500'}`}>
                            {(tx.pnl || 0) >= 0 ? '+' : ''}{formatCurrency(tx.pnl || 0)}
                          </p>
                          {tx.closedAt && (
                            <p className="text-[9px] text-[#617589]">{new Date(tx.closedAt).toLocaleDateString('en-IN')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {/* Modify Order Bottom Sheet (broker context) */}
      <ModifyOrderSheet
        isOpen={!!modifyOrder}
        order={modifyOrder}
        onClose={() => setModifyOrder(null)}
        onModified={fetchOrders}
        apiUpdateOrder={brokerUpdateOrder}
        apiGetBalance={brokerGetBalance}
        onConvertToHold={handleConvertToHold}
        onExtendValidity={handleExtendValidity}
        onAdjustHolding={handleAdjustHolding}
        brokerMode
      />

      {/* Order Detail Bottom Sheet */}
      <OrderDetailSheet
        isOpen={!!detailOrder}
        order={detailOrder}
        tab={detailTab}
        onClose={() => setDetailOrder(null)}
        onRefresh={fetchOrders}
        apiUpdateOrder={brokerUpdateOrder}
      />

      {/* Credentials Modal */}
      {credentialsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCredentialsModal(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111418] text-lg font-bold">Client Credentials</h3>
              <button onClick={() => setCredentialsModal(null)} className="text-gray-400 hover:text-gray-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-3">
              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[#617589] text-xs font-medium mb-1">Client ID</p>
                <p className="text-[#111418] text-sm font-bold font-mono">{credentialsModal.id}</p>
              </div>
              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[#617589] text-xs font-medium mb-1">Password</p>
                <p className="text-[#111418] text-sm font-bold font-mono">{credentialsModal.password}</p>
              </div>
            </div>
            <button onClick={() => setCredentialsModal(null)} className="w-full mt-4 h-11 bg-[#137fec] text-white rounded-xl font-bold text-sm">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="size-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-red-500 text-[28px]">delete_forever</span>
              </div>
              <h3 className="text-[#111418] text-lg font-bold mb-1">Delete {client.name}?</h3>
              <p className="text-[#617589] text-sm">This will move the client to recycle bin. All their data will be preserved.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="flex-1 h-11 bg-red-500 text-white rounded-xl font-bold text-sm"
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal (Convert / Extend) */}
      {actionConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeActionConfirm}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center mb-4">
              <div className={`size-14 rounded-full flex items-center justify-center mb-3 ${actionConfirm.iconBgClass || 'bg-gray-100'}`}>
                <span className={`material-symbols-outlined text-[28px] ${actionConfirm.iconTextClass || 'text-[#111418]'}`}>
                  {actionConfirm.icon || 'help'}
                </span>
              </div>
              <h3 className="text-[#111418] text-lg font-bold mb-1">{actionConfirm.title}</h3>
              <p className="text-[#617589] text-sm">{actionConfirm.message}</p>
            </div>

            {actionConfirmError && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium">
                {actionConfirmError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={closeActionConfirm}
                disabled={actionConfirmSubmitting}
                className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeActionConfirm}
                disabled={actionConfirmSubmitting}
                className={`flex-1 h-11 text-white rounded-xl font-bold text-sm disabled:opacity-70 ${actionConfirm.confirmClass || 'bg-[#137fec] hover:bg-blue-600'}`}
              >
                {actionConfirmSubmitting ? (actionConfirm.loadingLabel || 'Processing...') : (actionConfirm.confirmLabel || 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDetail;
