import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMarketStatusIST, getMarketStatusForInstrument } from '../utils/marketStatus';

const REFRESH_INTERVAL_MS = 15 * 1000;
const MARKET_CLOSED_TEXT = 'Market Closed. Open From 9:15AM To 3:15PM On Working Days';
const MCX_MARKET_CLOSED_TEXT = 'MCX Market Closed. Open From 9:15AM To 11:00PM On Working Days';

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

  const isPrivilegedBypass =
    !!user?.isImpersonation &&
    ['broker', 'admin'].includes(String(user?.impersonatorRole || '').toLowerCase());
  const isCustomerTradeAllowed = isPrivilegedBypass || marketStatus.isOpen;
  const marketClosedReason = isPrivilegedBypass ? '' : MARKET_CLOSED_TEXT;

  // Instrument-aware trading gate: checks MCX vs standard timing
  const isTradingAllowed = useCallback(({ exchange, segment } = {}) => {
    if (isPrivilegedBypass) return true;
    const status = getMarketStatusForInstrument({ exchange, segment, now: new Date(nowTs) });
    return status.isOpen;
  }, [isPrivilegedBypass, nowTs]);

  const getClosedMessage = useCallback(({ exchange, segment } = {}) => {
    if (isPrivilegedBypass) return '';
    const status = getMarketStatusForInstrument({ exchange, segment, now: new Date(nowTs) });
    if (status.isOpen) return '';
    return status.sessionType === 'MCX' ? MCX_MARKET_CLOSED_TEXT : MARKET_CLOSED_TEXT;
  }, [isPrivilegedBypass, nowTs]);

  return {
    isBrokerBypass: isPrivilegedBypass,
    isPrivilegedBypass,
    isMarketOpen: marketStatus.isOpen,
    isCustomerTradeAllowed,
    marketClosedReason,
    marketStatus,
    isTradingAllowed,
    getClosedMessage,
  };
};

export default useCustomerTradingGate;
