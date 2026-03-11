import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import adminApi from '../../api/admin';
import BrokerDetailSheet from './components/BrokerDetailSheet';
import DeleteBrokerConfirmModal from './components/DeleteBrokerConfirmModal';

const CreateBrokerSheet = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', password: '', email: '', phone: '', ownerName: '', companyName: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Broker name is required.'); return; }
    if (!form.password || form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await adminApi.createBroker({
        name: form.name.trim(),
        password: form.password,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        ownerName: form.ownerName.trim() || undefined,
        companyName: form.companyName.trim() || undefined,
      });
      setCreated(res.broker);
      onCreated?.();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create broker.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="flex-1" onClick={created ? onClose : undefined} />
      <div className="bg-white rounded-t-2xl max-h-[92dvh] flex flex-col w-full max-w-md mx-auto overflow-hidden">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-100">
          <h2 className="text-base font-bold">Create Broker</h2>
          <button onClick={onClose} className="flex items-center justify-center size-8 rounded-full hover:bg-gray-100">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4">
          {created ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="size-16 rounded-full bg-green-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-green-600 text-[32px]">check_circle</span>
              </div>
              <div className="text-center">
                <p className="font-bold text-base">Broker Created!</p>
                <p className="text-sm text-gray-500 mt-0.5">{created.name}</p>
              </div>

              {created.referenceCode && (
                <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                  <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Reference Code</p>
                  <p className="font-mono font-bold text-2xl tracking-widest text-[#137fec]">{created.referenceCode}</p>
                  <p className="text-[10px] text-blue-500 mt-1">Share this code with customers during registration</p>
                </div>
              )}

              <div className="w-full bg-gray-50 rounded-xl p-3 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Broker ID</span>
                  <span className="font-mono font-semibold">{created.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="font-semibold">{created.email || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className="font-semibold text-green-600">Active</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full h-11 bg-[#137fec] text-white rounded-xl text-sm font-semibold"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">{error}</div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Broker Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={handleChange('name')}
                  placeholder="e.g. OneCapital Brokerage"
                  className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={handleChange('password')}
                    placeholder="Min. 6 characters"
                    className="w-full h-10 rounded-xl border border-gray-200 pl-3 pr-10 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    <span className="material-symbols-outlined text-[18px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="broker@example.com"
                  className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={handleChange('phone')}
                  placeholder="10-digit mobile"
                  className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Owner Name</label>
                <input
                  type="text"
                  value={form.ownerName}
                  onChange={handleChange('ownerName')}
                  placeholder="Full name of owner"
                  className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Company Name</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={handleChange('companyName')}
                  placeholder="Registered company name"
                  className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none"
                />
              </div>

              <div className="pt-2 pb-4">
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full h-11 bg-[#137fec] text-white rounded-xl text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? 'Creating…' : 'Create Broker'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Brokers = () => {
  const navigate = useNavigate();
  const { brokerId } = useParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentPage = 1;
  const [brokers, setBrokers] = useState([]);
  const [deletingBrokerId, setDeletingBrokerId] = useState('');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchBrokers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getAllBrokers({
        page: currentPage,
        limit: 20,
        search: searchQuery,
        status: filterStatus !== 'All' ? filterStatus.toLowerCase() : undefined
      });

      const brokersData = response.brokers || response.data || [];
      setBrokers(brokersData.map(broker => ({
        id: broker.id || broker._id,
        _id: broker._id || broker.id,
        name: broker.name || 'Unknown Broker',
        ownerName: broker.ownerName || broker.name || '',
        status: broker.status ? broker.status.charAt(0).toUpperCase() + broker.status.slice(1) : 'Unknown',
        clients: broker.clientCount || 0,
        referenceCode: broker.referenceCode || null,
        complianceScore: broker.complianceScore || 100,
        lastLogin: broker.lastLogin ? new Date(broker.lastLogin).toLocaleDateString() : 'Never'
      })));

    } catch (err) {
      console.error('Failed to fetch brokers:', err);
      setError(err.message || 'Failed to load brokers');
      setBrokers([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, filterStatus]);

  useEffect(() => { fetchBrokers(); }, [fetchBrokers]);

  const filteredBrokers = brokers.filter(broker => {
    const matchesSearch = broker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      broker.ownerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'All' || broker.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getComplianceColor = (score) => {
    if (score >= 90) return 'text-green-600 bg-green-50';
    if (score >= 75) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const handleDeleteBroker = (broker) => {
    const brokerKey = String(broker._id || broker.id || '');
    if (!brokerKey) return;
    setDeleteTarget({
      id: brokerKey,
      name: broker.name || 'Unknown Broker',
      clients: broker.clients || 0,
    });
  };

  const closeDeleteModal = () => {
    if (deletingBrokerId) return;
    setDeleteTarget(null);
  };

  const confirmDeleteBroker = async () => {
    const brokerKey = String(deleteTarget?.id || '');
    if (!brokerKey) return;

    setDeletingBrokerId(brokerKey);
    setError(null);

    try {
      await adminApi.deleteBroker(brokerKey);
      if (brokerId && String(brokerId) === brokerKey) {
        navigate('/admin/brokers');
      }
      await fetchBrokers();
      setDeleteTarget(null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to delete broker');
    } finally {
      setDeletingBrokerId('');
    }
  };

  const openDetail = (id) => navigate(`/admin/brokers/${id}`);
  const closeDetail = () => { fetchBrokers(); navigate('/admin/brokers'); };

  return (
    <div className="relative flex h-full min-h-screen min-h-[100dvh] w-full flex-col max-w-md mx-auto bg-[#f6f7f8] overflow-x-hidden pb-20 sm:pb-24">
      {/* Broker Detail Sheet */}
      {brokerId && (
        <BrokerDetailSheet brokerId={brokerId} onClose={closeDetail} />
      )}

      {/* Create Broker Sheet */}
      {showCreateSheet && (
        <CreateBrokerSheet
          onClose={() => setShowCreateSheet(false)}
          onCreated={fetchBrokers}
        />
      )}

      {deleteTarget && (
        <DeleteBrokerConfirmModal
          key={deleteTarget.id}
          brokerName={deleteTarget.name}
          customerCount={deleteTarget.clients || 0}
          deleting={deletingBrokerId === String(deleteTarget.id || '')}
          onCancel={closeDeleteModal}
          onConfirm={confirmDeleteBroker}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
            </button>
            <h1 className="text-base sm:text-lg font-bold leading-tight tracking-[-0.015em]">Broker Management</h1>
          </div>
          <button
            onClick={() => setShowCreateSheet(true)}
            className="flex items-center gap-1.5 h-8 px-3 bg-[#137fec] text-white rounded-lg text-xs font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            New
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <span className="material-symbols-outlined text-[18px] sm:text-[20px]">search</span>
            </span>
            <input
              type="text"
              placeholder="Search brokers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 sm:h-10 rounded-lg border border-gray-200 pl-9 sm:pl-10 pr-3 text-sm bg-gray-50 focus:bg-white focus:border-[#137fec] focus:ring-2 focus:ring-[#137fec]/20 outline-none transition-all"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
          {['All', 'Active', 'Blocked'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`shrink-0 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                filterStatus === status ? 'bg-[#137fec] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </header>

      {/* Brokers List */}
      <main className="flex-1 p-3 sm:p-4">
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 text-sm text-red-700">{error}</div>
        )}
        <div className="flex flex-col gap-3 sm:gap-4">
          {filteredBrokers.map(broker => (
            <div
              key={broker.id}
              onClick={() => openDetail(broker._id)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="size-11 sm:size-12 rounded-full bg-gradient-to-br from-[#137fec] to-blue-400 flex items-center justify-center text-white font-bold text-base sm:text-lg shrink-0">
                  {broker.name.charAt(0)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-base font-bold truncate">{broker.name}</h3>
                      {broker.ownerName && broker.ownerName !== broker.name && (
                        <p className="text-xs text-gray-500 truncate">{broker.ownerName}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${
                        broker.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {broker.status}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBroker(broker);
                        }}
                        disabled={deletingBrokerId === String(broker._id || broker.id)}
                        className="h-6 px-2 rounded-md bg-red-50 text-red-700 border border-red-100 text-[10px] font-semibold disabled:opacity-60"
                      >
                        {deletingBrokerId === String(broker._id || broker.id) ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-3 sm:gap-4 mt-2">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-gray-400 text-[14px] sm:text-[16px]">group</span>
                      <span className="text-xs font-medium text-gray-700">{broker.clients} Clients</span>
                    </div>
                    {broker.referenceCode && (
                      <div className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-gray-400 text-[14px]">badge</span>
                        <span className="text-xs font-mono font-medium text-gray-700">{broker.referenceCode}</span>
                      </div>
                    )}
                  </div>

                  {/* Compliance Score */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Compliance:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${getComplianceColor(broker.complianceScore)}`}>
                        {broker.complianceScore}%
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-400">{broker.lastLogin}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredBrokers.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="material-symbols-outlined text-4xl sm:text-5xl mb-2">search_off</span>
              <p className="text-sm font-medium">No brokers found</p>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 w-full max-w-md mx-auto bg-white border-t border-gray-200 z-30">
        <div className="flex justify-around items-center h-14 sm:h-16">
          <button onClick={() => navigate('/admin/dashboard')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">dashboard</span>
            <span className="text-[10px] font-medium">Dashboard</span>
          </button>
          <button onClick={() => navigate('/admin/customers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">group</span>
            <span className="text-[10px] font-medium">Customers</span>
          </button>
          <button onClick={() => navigate('/admin/brokers')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-[#137fec]">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">corporate_fare</span>
            <span className="text-[10px] font-medium">Brokers</span>
          </button>
          <button onClick={() => navigate('/admin/chats')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">chat</span>
            <span className="text-[10px] font-medium">Chats</span>
          </button>
          <button onClick={() => navigate('/admin/settings')} className="flex flex-col items-center gap-0.5 sm:gap-1 w-full h-full justify-center text-gray-500 hover:text-[#137fec] transition-colors">
            <span className="material-symbols-outlined text-[20px] sm:text-[24px]">settings</span>
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Brokers;
