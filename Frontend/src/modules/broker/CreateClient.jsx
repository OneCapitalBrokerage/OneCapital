import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';

const CreateClient = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError('Name is required');
    if (!form.password.trim()) return setError('Password is required');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    try {
      const response = await brokerApi.createClient({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password
      });

      setSuccess({
        id: response.client?.id || '---',
        name: response.client?.name || form.name,
        password: form.password
      });
    } catch (err) {
      setError(err.message || 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col min-h-screen bg-[#f6f7f8]">
        <div className="sticky top-0 z-50 flex items-center bg-white px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-200">
          <button onClick={() => navigate('/broker/clients')} className="flex size-9 sm:size-10 items-center justify-center rounded-full hover:bg-gray-100 -ml-2">
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">close</span>
          </button>
          <h1 className="text-base sm:text-lg font-bold flex-1 text-center">Client Created</h1>
          <div className="size-9 sm:size-10"></div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center mb-6">
              <div className="size-16 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-green-500 text-[32px]">check_circle</span>
              </div>
              <h2 className="text-[#111418] text-xl font-bold mb-1">Client Created!</h2>
              <p className="text-[#617589] text-sm text-center">Save the credentials below. The password is only shown once.</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-3">
              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[#617589] text-xs font-medium mb-1">Name</p>
                <p className="text-[#111418] text-sm font-bold">{success.name}</p>
              </div>
              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[#617589] text-xs font-medium mb-1">Client ID</p>
                <p className="text-[#111418] text-sm font-bold font-mono">{success.id}</p>
              </div>
              <div className="bg-[#f6f7f8] rounded-xl p-3">
                <p className="text-[#617589] text-xs font-medium mb-1">Password</p>
                <p className="text-[#111418] text-sm font-bold font-mono">{success.password}</p>
              </div>
            </div>

            <button
              onClick={() => navigate('/broker/clients')}
              className="w-full mt-6 h-12 bg-[#137fec] text-white rounded-xl font-bold text-sm"
            >
              Go to Client List
            </button>
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
        <h1 className="text-base sm:text-lg font-bold flex-1 text-center">Create Client</h1>
        <div className="size-9 sm:size-10"></div>
      </div>

      <div className="flex-1 p-3 sm:p-4">
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
              placeholder="client@example.com (optional)"
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
              placeholder="10-digit mobile number (optional)"
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-sm text-[#111418] placeholder:text-[#617589] focus:outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-[#111418] text-sm font-bold mb-1.5 block">Password *</label>
            <input
              type="text"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Min 6 characters"
              className="w-full h-12 px-4 rounded-xl bg-white border border-gray-200 text-sm text-[#111418] placeholder:text-[#617589] focus:outline-none focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec]"
            />
            <p className="text-[#617589] text-xs mt-1">Client ID will be auto-generated</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500 text-[18px]">error</span>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-[#137fec] text-white rounded-xl font-bold text-sm shadow-lg shadow-[#137fec]/20 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Client'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateClient;
