import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  formatMarketClosedMessage,
  getMarketStatusIST,
  getMarketStatusForInstrument,
} from '../utils/marketStatus';

const REFRESH_INTERVAL_MS = 15 * 1000;
const DEALER_MODE_MESSAGE = 'Your account is in View-Only mode. Contact your broker to place orders.';
const DEALER_MODE_FUNDS_MESSAGE = 'Your account is in View-Only mode. Contact your broker for fund operations.';

export const useCustomerTradingGate = () => {
  const { user, dealerMode } = useAuth();
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
  
  // Dealer mode blocks trading unless privileged bypass
  const isDealerModeActive = dealerMode && !isPrivilegedBypass;
  
  const isCustomerTradeAllowed = isPrivilegedBypass || (marketStatus.isOpen && !isDealerModeActive);
  const marketClosedReason = isDealerModeActive 
    ? DEALER_MODE_MESSAGE 
    : (isPrivilegedBypass ? '' : formatMarketClosedMessage());

  // Instrument-aware trading gate: checks MCX vs standard timing + dealer mode
  const isTradingAllowed = useCallback(({ exchange, segment } = {}) => {
    if (isPrivilegedBypass) return true;
    if (isDealerModeActive) return false;
    const status = getMarketStatusForInstrument({ exchange, segment, now: new Date(nowTs) });
    return status.isOpen;
  }, [isPrivilegedBypass, isDealerModeActive, nowTs]);

  const getClosedMessage = useCallback(({ exchange, segment } = {}) => {
    if (isPrivilegedBypass) return '';
    if (isDealerModeActive) return DEALER_MODE_MESSAGE;
    const status = getMarketStatusForInstrument({ exchange, segment, now: new Date(nowTs) });
    if (status.isOpen) return '';
    return formatMarketClosedMessage({ exchange, segment });
  }, [isPrivilegedBypass, isDealerModeActive, nowTs]);

  // Fund operations gate (for Add/Withdraw funds)
  const isFundsAllowed = useCallback(() => {
    if (isPrivilegedBypass) return true;
    return !isDealerModeActive;
  }, [isPrivilegedBypass, isDealerModeActive]);

  const getFundsBlockedMessage = useCallback(() => {
    if (isPrivilegedBypass) return '';
    if (isDealerModeActive) return DEALER_MODE_FUNDS_MESSAGE;
    return '';
  }, [isPrivilegedBypass, isDealerModeActive]);

  return {
    isBrokerBypass: isPrivilegedBypass,
    isPrivilegedBypass,
    isMarketOpen: marketStatus.isOpen,
    isCustomerTradeAllowed,
    marketClosedReason,
    marketStatus,
    isTradingAllowed,
    getClosedMessage,
    // Dealer mode specific
    isDealerModeActive,
    isFundsAllowed,
    getFundsBlockedMessage,
  };
};

export default useCustomerTradingGate;
