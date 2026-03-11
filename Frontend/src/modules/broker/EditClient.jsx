import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import brokerApi from '../../api/broker';

const EditClient = () => {
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [original, setOriginal] = useState(null);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const response = await brokerApi.getClientById(clientId);
        const client = response.client || response;
        setForm({
          name: client.name || '',
          email: client.email || '',
          phone: client.phone || '',
          password: '',
        });
        setOriginal(client);
      } catch (err) {
        setError(err.message || 'Failed to load client');
      } finally {
        setLoading(false);
      }
    };
    fetchClient();
  }, [clientId]);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError('Name is required');
    if (form.password && form.password.length < 6) return setError('Password must be at least 6 characters');

    // Build only changed fields
    const updates = {};
    if (form.name.trim() !== (original?.name || '')) updates.name = form.name.trim();
    if (form.email.trim() !== (original?.email || '')) updates.email = form.email.trim();
    if (form.phone.trim() !== (original?.phone || '')) updates.phone = form.phone.trim();
    if (form.password.trim()) updates.password = form.password.trim();

    if (Object.keys(updates).length === 0) {
      return setError('No changes to save');
    }

    setSaving(true);
    try {
      await brokerApi.updateClient(clientId, updates);
      setSuccess(true);
      setForm(prev => ({ ...prev, password: '' }));
      // Update original to reflect saved state
      setOriginal(prev => ({ ...prev, ...updates, password: prev?.password }));
    } catch (err) {
      setError(err.message || 'Failed to update client');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
        <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200">
          <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold flex-1 text-center">Edit Client</h1>
          <div className="size-9 sm:size-10"></div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="h-12 bg-gray-200 rounded-xl w-64"></div>
            <div className="h-12 bg-gray-200 rounded-xl w-64"></div>
            <div className="h-12 bg-gray-200 rounded-xl w-64"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
      {/* Header */}
      <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200">
        <button onClick={() => navigate(-1)} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back_ios_new</span>
        </button>
        <h1 className="text-base sm:text-lg font-bold flex-1 text-center">Edit Client</h1>
        <div className="size-9 sm:size-10"></div>
      </div>

      <div className="flex-1 p-3 sm:p-4">
        {/* Client ID display */}
        <div className="bg-white rounded-xl p-3 mb-4 border border-gray-200">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#137fec] text-[18px]">badge</span>
            <p className="text-[#617589] text-xs font-medium">Client ID</p>
          </div>
          <p className="text-[#111418] text-sm font-bold font-mono mt-1">{clientId}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-[#111418] text-sm font-bold mb-1.5 block">Full Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Enter client's full name"
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-sm text-[#111418] placeholder:text-[#617589] focus:outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-[#111418] text-sm font-bold mb-1.5 block">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="client@example.com"
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-sm text-[#111418] placeholder:text-[#617589] focus:outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="text-[#111418] text-sm font-bold mb-1.5 block">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-sm text-[#111418] placeholder:text-[#617589] focus:outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-[#111418] text-sm font-bold mb-1.5 block">New Password</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Leave blank to keep current password"
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-sm text-[#111418] placeholder:text-[#617589] focus:outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
            />
            <p className="text-[#617589] text-xs mt-1">Min 6 characters. Leave blank to keep unchanged.</p>
          </div>

          {success && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
              <p className="text-green-700 text-sm font-medium">Client updated successfully</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500 text-[18px]">error</span>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 bg-[#137fec] text-white rounded-xl font-bold text-sm shadow-lg shadow-[#137fec]/20 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditClient;
