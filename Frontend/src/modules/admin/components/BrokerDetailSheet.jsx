import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../../../api/admin';
import { setAuthToken, setRefreshToken, setStoredUser } from '../../../api/index';
import {
  clearAdminBrokerSwitchSnapshot,
  saveAdminBrokerSwitchSnapshot,
} from '../../../utils/adminBrokerSwitch';
import DeleteBrokerConfirmModal from './DeleteBrokerConfirmModal';

const BrokerDetailSheet = ({ brokerId, onClose }) => {
  const navigate = useNavigate();
  const [broker, setBroker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Credentials state
  const [credentials, setCredentials] = useState(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credLoading, setCredLoading] = useState(false);

  // Reference code edit state
  const [editingRefCode, setEditingRefCode] = useState(false);
  const [refCodeInput, setRefCodeInput] = useState('');
  const [refCodeError, setRefCodeError] = useState('');
  const [refCodeSaving, setRefCodeSaving] = useState(false);

  const fetchBroker = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getBrokerById(brokerId);
      setBroker(res.broker || res);
    } catch (err) {
      setError(err.message || 'Failed to load broker');
    } finally {
      setLoading(false);
    }
  }, [brokerId]);

  useEffect(() => {
    if (brokerId) {
      setCredentials(null);
      setShowCredentials(false);
      fetchBroker();
    }
  }, [fetchBroker]);

  const handleViewCredentials = async () => {
    if (credentials) { setShowCredentials(v => !v); return; }
    setCredLoading(true);
    try {
      const res = await adminApi.getBrokerCredentials(brokerId);
      setCredentials(res.credentials);
      setShowCredentials(true);
    } catch (err) {
      setError(err.message || 'Failed to fetch credentials');
    } finally {
      setCredLoading(false);
    }
  };

  const handleBlock = async () => {
    setActionLoading(true);
    try {
      const isBlocked = broker.status === 'blocked';
      if (isBlocked) {
        await adminApi.unblockBroker(broker._id);
        setBroker(prev => ({ ...prev, status: 'active' }));
      } else {
        await adminApi.blockBroker(broker._id, 'Blocked by admin');
        setBroker(prev => ({ ...prev, status: 'blocked' }));
      }
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEditRefCode = () => {
    setRefCodeInput(broker.referenceCode || '');
    setRefCodeError('');
    setEditingRefCode(true);
  };

  const handleSaveRefCode = async () => {
    const normalized = refCodeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
      setRefCodeError('4–12 characters, letters and digits only (A-Z, 0-9).');
      return;
    }
    setRefCodeSaving(true);
    setRefCodeError('');
    try {
      const res = await adminApi.updateReferenceCode(broker._id, normalized);
      setBroker(prev => ({ ...prev, referenceCode: res.referenceCode }));
      setEditingRefCode(false);
    } catch (err) {
      setRefCodeError(err?.response?.data?.message || err.message || 'Failed to update');
    } finally {
      setRefCodeSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!broker?._id && !broker?.id) return;
    setShowDeleteModal(true);
  };

  const handleLoginAsBroker = async () => {
    if (!broker) return;
    setActionLoading(true);
    setError(null);

    try {
      saveAdminBrokerSwitchSnapshot({
        returnTo: window.location.pathname + window.location.search,
      });

      const res = await adminApi.loginAsBroker(broker._id || broker.id);
      const accessToken = res.accessToken || res.token;
      if (!accessToken || !res.broker) {
        throw new Error('Invalid broker session response.');
      }

      setAuthToken(accessToken);
      setRefreshToken(res.refreshToken || null);
      setStoredUser({ ...res.broker, role: 'broker' });
      window.location.href = '/broker/dashboard';
    } catch (err) {
      clearAdminBrokerSwitchSnapshot();
      setError(err?.response?.data?.message || err.message || 'Failed to login as broker');
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!broker?._id && !broker?.id) return;

    setDeleteLoading(true);
    setError(null);
    try {
      await adminApi.deleteBroker(broker._id || broker.id);
      setShowDeleteModal(false);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to delete broker');
    } finally {
      setDeleteLoading(false);
    }
  };

  const statusColor = (s) => {
    if (s === 'blocked') return 'bg-red-100 text-red-700';
    if (s === 'active') return 'bg-green-100 text-green-700';
    if (s === 'pending_verification') return 'bg-yellow-100 text-yellow-700';
    return 'bg-gray-100 text-gray-600';
  };

  const complianceColor = (score) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 75) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.45)' }}>
      {showDeleteModal && (
        <DeleteBrokerConfirmModal
          key={broker?._id || broker?.id || 'broker-delete'}
          brokerName={broker?.name}
          customerCount={broker?.stats?.totalClients || 0}
          deleting={deleteLoading}
          onCancel={() => !deleteLoading && setShowDeleteModal(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
      <div className="flex-1" onClick={onClose} />
      <div className="bg-white rounded-t-2xl max-h-[92dvh] flex flex-col w-full max-w-md mx-auto overflow-hidden">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-100">
          <h2 className="text-base font-bold">Broker Detail</h2>
          <button onClick={onClose} className="flex items-center justify-center size-8 rounded-full hover:bg-gray-100">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#137fec] animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          {!loading && broker && (
            <>
              {/* Identity */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-12 rounded-full bg-gradient-to-br from-[#137fec] to-blue-400 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {broker.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{broker.name}</h3>
                    {broker.ownerName && broker.ownerName !== broker.name && (
                      <p className="text-xs text-gray-500">{broker.ownerName}</p>
                    )}
                    <p className="text-xs text-gray-500 truncate">{broker.email || '—'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${statusColor(broker.status)}`}>
                    {broker.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Broker ID</p>
                    <p className="font-semibold font-mono">{broker.id}</p>
                  </div>
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Phone</p>
                    <p className="font-semibold">{broker.phone || '—'}</p>
                  </div>
                  {broker.companyName && (
                    <div className="bg-white rounded-lg px-2.5 py-2 col-span-2">
                      <p className="text-gray-400 uppercase tracking-wide mb-0.5">Company</p>
                      <p className="font-semibold">{broker.companyName}</p>
                    </div>
                  )}
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Clients</p>
                    <p className="font-bold text-sm">{broker.stats?.totalClients ?? 0}</p>
                  </div>
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Active Clients</p>
                    <p className="font-bold text-sm text-green-600">{broker.stats?.activeClients ?? 0}</p>
                  </div>
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Compliance</p>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${complianceColor(broker.complianceScore)}`}>
                      {broker.complianceScore}%
                    </span>
                  </div>
                  <div className="bg-white rounded-lg px-2.5 py-2">
                    <p className="text-gray-400 uppercase tracking-wide mb-0.5">Last Login</p>
                    <p className="font-semibold">{broker.lastLogin ? new Date(broker.lastLogin).toLocaleDateString('en-IN') : 'Never'}</p>
                  </div>
                </div>
              </div>

              {/* Reference Code */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Reference Code</p>
                  {!editingRefCode && (
                    <button
                      onClick={handleStartEditRefCode}
                      className="text-[#137fec] text-xs font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                      Edit
                    </button>
                  )}
                </div>

                {!editingRefCode ? (
                  <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-3">
                    <span className="material-symbols-outlined text-[#137fec] text-[20px]">badge</span>
                    <span className="font-mono font-bold text-base tracking-widest">
                      {broker.referenceCode || <span className="text-gray-400 font-normal tracking-normal text-sm">Not set</span>}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={refCodeInput}
                      onChange={(e) => { setRefCodeInput(e.target.value.toUpperCase()); setRefCodeError(''); }}
                      maxLength={12}
                      placeholder="e.g. OCAP0001"
                      className="w-full h-10 rounded-xl border border-gray-200 px-3 font-mono text-sm bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none uppercase"
                    />
                    {refCodeError && <p className="text-xs text-red-600">{refCodeError}</p>}
                    <p className="text-[10px] text-gray-400">4–12 characters. Letters (A-Z) and digits (0-9) only.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveRefCode}
                        disabled={refCodeSaving}
                        className="flex-1 h-9 bg-[#137fec] text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                      >
                        {refCodeSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingRefCode(false)}
                        className="flex-1 h-9 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Credentials */}
              <div className="bg-gray-50 rounded-xl p-4">
                <button
                  onClick={handleViewCredentials}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-blue-50 text-[#137fec]">
                      <span className="material-symbols-outlined text-[18px]">key</span>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold">View Credentials</p>
                      <p className="text-[10px] text-gray-500">Broker ID + password</p>
                    </div>
                  </div>
                  {credLoading
                    ? <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-[#137fec] animate-spin" />
                    : <span className="material-symbols-outlined text-gray-400 text-[18px]">{showCredentials ? 'expand_less' : 'expand_more'}</span>
                  }
                </button>
                {showCredentials && credentials && (
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                    <div className="bg-white rounded-lg px-3 py-2 flex justify-between">
                      <span className="text-gray-400">Broker ID</span>
                      <span className="font-semibold font-mono">{credentials.brokerId}</span>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 flex justify-between">
                      <span className="text-gray-400">Email</span>
                      <span className="font-semibold">{credentials.email || '—'}</span>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 flex justify-between">
                      <span className="text-gray-400">Phone</span>
                      <span className="font-semibold">{credentials.phone || '—'}</span>
                    </div>
                    <div className="bg-white rounded-lg px-3 py-2 flex justify-between">
                      <span className="text-gray-400">Password</span>
                      <span className="font-semibold font-mono">{credentials.password}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Block / Unblock */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Controls</p>
                <div className={`flex items-center justify-between bg-white p-3 rounded-xl mb-2 ${actionLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-blue-50 text-[#137fec]">
                      <span className="material-symbols-outlined text-[18px]">login</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Login As Broker</p>
                      <p className="text-[10px] text-gray-500">Switch into broker panel directly</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLoginAsBroker}
                    disabled={broker.status === 'blocked' || broker.status === 'suspended' || broker.status === 'inactive'}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {actionLoading ? 'Switching...' : 'Login'}
                  </button>
                </div>

                <div className={`flex items-center justify-between bg-white p-3 rounded-xl ${actionLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-full ${broker.status === 'blocked' ? 'bg-orange-50 text-orange-500' : 'bg-red-50 text-red-500'}`}>
                      <span className="material-symbols-outlined text-[18px]">{broker.status === 'blocked' ? 'lock_open' : 'block'}</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">{broker.status === 'blocked' ? 'Unblock Broker' : 'Block Broker'}</p>
                      <p className="text-[10px] text-gray-500">{broker.status === 'blocked' ? 'Restore access' : 'Blocks broker + all customers'}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleBlock}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${broker.status === 'blocked' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {broker.status === 'blocked' ? 'Unblock' : 'Block'}
                  </button>
                </div>

                <div className={`flex items-center justify-between bg-white p-3 rounded-xl mt-2 ${deleteLoading ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-red-50 text-red-500">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold">Delete Broker</p>
                      <p className="text-[10px] text-gray-500">Permanent remove, no recycle bin</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700"
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>

              {/* View Clients */}
              <button
                onClick={() => { onClose(); navigate(`/admin/customers?brokerId=${broker.id}`); }}
                className="w-full flex items-center justify-center gap-2 h-11 bg-gray-100 text-gray-800 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">group</span>
                View All Customers ({broker.stats?.totalClients ?? 0})
              </button>

              <div className="pb-4" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrokerDetailSheet;
