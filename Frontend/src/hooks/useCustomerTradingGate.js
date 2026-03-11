import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMarketStatusIST } from '../utils/marketStatus';

const REFRESH_INTERVAL_MS = 15 * 1000;
const MARKET_CLOSED_TEXT = 'Market Closed. Open From 9:15AM To 3:15PM On Working Days';

const getMarketClosedMessage = (reason) => {
  if (reason === 'holiday' || reason === 'weekend') return MARKET_CLOSED_TEXT;
  return MARKET_CLOSED_TEXT;
};

export const useCustomerTradingGate = () => {
  const { user } = useAuth();
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const marketStatus = useMemo(
    () => getMarketStatusIST(new Date(nowTs)),
    [nowTs]
  );

  const isBrokerBypass =
    !!user?.isImpersonation && String(user?.impersonatorRole || '').toLowerCase() === 'broker';
  const isCustomerTradeAllowed = isBrokerBypass || marketStatus.isOpen;
  const marketClosedReason = isBrokerBypass ? '' : getMarketClosedMessage(marketStatus.reason);

  return {
    isBrokerBypass,
    isMarketOpen: marketStatus.isOpen,
    isCustomerTradeAllowed,
    marketClosedReason,
    marketStatus,
  };
};

export default useCustomerTradingGate;
