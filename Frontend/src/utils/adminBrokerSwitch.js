const ADMIN_SWITCH_SESSION_KEYS = {
  token: 'adminSwitchToken',
  user: 'adminSwitchUser',
  returnTo: 'adminSwitchReturnTo',
};

const readStoredRole = (rawUser) => {
  if (!rawUser) return null;
  try {
    return JSON.parse(rawUser)?.role || null;
  } catch {
    return null;
  }
};

const getSession = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
};

export const saveAdminBrokerSwitchSnapshot = ({ returnTo } = {}) => {
  if (typeof window === 'undefined') return;

  const adminToken = window.localStorage.getItem('accessToken');
  const adminUser = window.localStorage.getItem('user');
  const role = readStoredRole(adminUser);
  if (!adminToken || !adminUser || role !== 'admin') {
    throw new Error('Current admin session is not available.');
  }

  const session = getSession();
  if (!session) return;

  session.setItem(ADMIN_SWITCH_SESSION_KEYS.token, adminToken);
  session.setItem(ADMIN_SWITCH_SESSION_KEYS.user, adminUser);
  session.setItem(
    ADMIN_SWITCH_SESSION_KEYS.returnTo,
    returnTo || window.location.pathname + window.location.search
  );
};

export const hasAdminBrokerSwitchSnapshot = () => {
  const session = getSession();
  if (!session) return false;
  return Boolean(
    session.getItem(ADMIN_SWITCH_SESSION_KEYS.token) &&
    session.getItem(ADMIN_SWITCH_SESSION_KEYS.user)
  );
};

export const clearAdminBrokerSwitchSnapshot = () => {
  const session = getSession();
  if (!session) return;
  session.removeItem(ADMIN_SWITCH_SESSION_KEYS.token);
  session.removeItem(ADMIN_SWITCH_SESSION_KEYS.user);
  session.removeItem(ADMIN_SWITCH_SESSION_KEYS.returnTo);
};

export const restoreAdminFromBrokerSwitch = (fallbackPath = '/admin/brokers') => {
  if (typeof window === 'undefined') return false;

  const session = getSession();
  if (!session) return false;

  const adminToken = session.getItem(ADMIN_SWITCH_SESSION_KEYS.token);
  const adminUser = session.getItem(ADMIN_SWITCH_SESSION_KEYS.user);
  const returnTo = session.getItem(ADMIN_SWITCH_SESSION_KEYS.returnTo);

  if (!adminToken || !adminUser) {
    clearAdminBrokerSwitchSnapshot();
    return false;
  }

  window.localStorage.setItem('accessToken', adminToken);
  window.localStorage.setItem('user', adminUser);
  clearAdminBrokerSwitchSnapshot();
  window.location.href = returnTo || fallbackPath;
  return true;
};
