const ImpersonationBanner = () => {
  const storedUser = (() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  })();

  if (!storedUser?.isImpersonation) return null;

  const handleExit = () => {
    // Restore broker token and user
    const brokerToken = sessionStorage.getItem('brokerToken');
    const brokerUser = sessionStorage.getItem('brokerUser');

    if (brokerToken) {
      localStorage.setItem('accessToken', brokerToken);
      sessionStorage.removeItem('brokerToken');
    }
    if (brokerUser) {
      localStorage.setItem('user', brokerUser);
      sessionStorage.removeItem('brokerUser');
    }

    // Full page reload to re-initialize auth contexts with broker session
    window.location.href = '/broker/clients';
  };

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-between bg-amber-500 px-3 py-1.5 text-white">
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined text-[16px]">visibility</span>
        <span className="text-xs font-medium truncate">
          Viewing as {storedUser.name || storedUser.id || 'Client'}
        </span>
      </div>
      <button
        onClick={handleExit}
        className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-white/20 rounded-lg text-[11px] font-bold hover:bg-white/30 transition-colors"
      >
        <span className="material-symbols-outlined text-[14px]">close</span>
        Exit
      </button>
    </div>
  );
};

export default ImpersonationBanner;
