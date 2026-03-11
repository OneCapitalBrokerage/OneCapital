import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import customerApi from '../../api/customer';
import { useAuth } from '../../context/AuthContext';

const formatDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const maskAadhaar = (num) => {
  if (!num) return null;
  const s = String(num);
  return s.length >= 4 ? 'XXXX XXXX ' + s.slice(-4) : s;
};

const LockedRow = ({ label, value }) => (
  <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-[#22352d] last:border-b-0">
    <span className="text-[#617589] dark:text-[#9cb7aa] text-[13px] sm:text-[14px] w-28 shrink-0">{label}</span>
    <span className="text-[#111418] dark:text-[#e8f3ee] text-[13px] sm:text-[14px] font-medium text-right flex-1 ml-2 truncate">
      {value || <span className="text-gray-400 dark:text-[#6f8b7f] font-normal">Not available</span>}
    </span>
    <span className="material-symbols-outlined text-gray-300 dark:text-[#22352d] text-[18px] ml-2 shrink-0">lock</span>
  </div>
);

const ProfileEdit = () => {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await customerApi.getProfile();
        const p = res.profile || res;
        setProfile(p);
        if (p.profilePhoto) {
          setPhotoPreview(p.profilePhoto);
          setPhotoUrl(p.profilePhoto);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPhotoPreview(objectUrl);
    setError('');

    setUploading(true);
    try {
      // Get Cloudinary signature
      const sigRes = await customerApi.getProfilePhotoUploadSignature();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', sigRes.apiKey);
      formData.append('timestamp', sigRes.timestamp);
      formData.append('signature', sigRes.signature);
      formData.append('folder', sigRes.folder);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sigRes.cloudName}/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await uploadRes.json();

      if (!data.secure_url) throw new Error('Upload failed');
      setPhotoUrl(data.secure_url);
    } catch (err) {
      console.error('Photo upload failed:', err);
      setError('Photo upload failed. Please try again.');
      setPhotoPreview(profile?.profilePhoto || null);
      setPhotoUrl(profile?.profilePhoto || null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!photoUrl || photoUrl === profile?.profilePhoto) return;
    setSaving(true);
    setError('');
    try {
      await customerApi.uploadProfilePhoto(photoUrl);
      // Refresh AuthContext so Watchlist header and other places update immediately
      await refreshProfile();
      setSuccess('Profile photo updated.');
      setTimeout(() => navigate(-1), 1200);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save photo.');
    } finally {
      setSaving(false);
    }
  };

  const photoChanged = photoUrl && photoUrl !== profile?.profilePhoto;
  const initials = profile?.name
    ? profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="flex flex-col min-h-screen bg-[#f2f4f6] dark:bg-[#050806]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#f2f4f6] dark:bg-[#050806] flex items-center px-3 sm:px-4 py-2.5 sm:py-3 justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center text-[#111418] dark:text-[#e8f3ee] hover:opacity-70"
        >
          <span className="material-symbols-outlined text-[22px]">arrow_back_ios_new</span>
        </button>
        <h2 className="text-[#111418] dark:text-[#e8f3ee] text-[17px] sm:text-[19px] font-bold">Edit Profile</h2>
        <button
          onClick={handleSave}
          disabled={!photoChanged || saving}
          className={`text-[14px] sm:text-[15px] font-semibold transition-opacity ${
            photoChanged && !saving
              ? 'text-[#137fec] hover:opacity-80'
              : 'text-gray-300 dark:text-[#22352d] cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#137fec] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="px-3 sm:px-4 pb-10 space-y-5 mt-2">

          {/* Status messages */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 text-[13px]">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 dark:bg-emerald-900/20 border border-green-200 dark:border-emerald-800 text-green-700 dark:text-emerald-400 rounded-xl px-4 py-3 text-[13px]">
              {success}
            </div>
          )}

          {/* Photo Section */}
          <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm p-5 flex flex-col items-center gap-3">
            <div className="relative">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Profile"
                  className="size-20 sm:size-24 rounded-full object-cover border-2 border-gray-100 dark:border-[#22352d]"
                />
              ) : (
                <div className="size-20 sm:size-24 bg-[#137fec] rounded-full flex items-center justify-center">
                  <span className="text-white text-2xl sm:text-3xl font-bold">{initials}</span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-[#137fec] text-[13px] sm:text-[14px] font-semibold hover:opacity-80 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">photo_camera</span>
              {uploading ? 'Uploading...' : 'Change Photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>

          {/* Identity Details — Locked */}
          <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#22352d]">
              <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-bold">Identity Details</h3>
              <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[18px]">lock</span>
            </div>
            <LockedRow label="Full Name" value={profile?.name} />
            <LockedRow label="Date of Birth" value={formatDate(profile?.dateOfBirth)} />
            <LockedRow label="PAN Number" value={profile?.panNumber} />
            <LockedRow
              label="Gender"
              value={profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : null}
            />
            <div className="px-4 py-3 bg-[#f6f7f8] dark:bg-[#111b17] flex items-start gap-2">
              <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[16px] mt-0.5 shrink-0">info</span>
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[12px] leading-relaxed">
                Identity details are as per your PAN/KYC records. Contact support if correction is needed.
              </p>
            </div>
          </div>

          {/* Contact & Security — Redirect to Settings */}
          <div className="bg-white dark:bg-[#0b120f] rounded-xl border border-gray-200 dark:border-[#22352d] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-[#22352d]">
              <h3 className="text-[#111418] dark:text-[#e8f3ee] text-[14px] sm:text-[15px] font-bold">Contact & Security</h3>
            </div>

            {[
              { icon: 'mail', label: 'Email', value: profile?.email },
              { icon: 'call', label: 'Phone', value: profile?.phone },
              { icon: 'lock', label: 'Password', value: '••••••••' },
            ].map((row, i, arr) => (
              <button
                key={row.label}
                onClick={() => navigate('/settings')}
                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-[#16231d] transition-colors text-left ${
                  i < arr.length - 1 ? 'border-b border-gray-100 dark:border-[#22352d]' : ''
                }`}
              >
                <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[20px] shrink-0">{row.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[#617589] dark:text-[#9cb7aa] text-[11px] sm:text-[12px]">{row.label}</p>
                  <p className="text-[#111418] dark:text-[#e8f3ee] text-[13px] sm:text-[14px] font-medium truncate">
                    {row.value || <span className="text-gray-400 dark:text-[#6f8b7f] font-normal">Not set</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[#617589] dark:text-[#9cb7aa] text-[11px]">Go to Settings</span>
                  <span className="material-symbols-outlined text-gray-400 dark:text-[#6f8b7f] text-[16px]">chevron_right</span>
                </div>
              </button>
            ))}

            <div className="px-4 py-3 bg-[#f6f7f8] dark:bg-[#111b17] flex items-start gap-2">
              <span className="material-symbols-outlined text-[#617589] dark:text-[#9cb7aa] text-[16px] mt-0.5 shrink-0">info</span>
              <p className="text-[#617589] dark:text-[#9cb7aa] text-[12px] leading-relaxed">
                To change your email, phone, or password, go to Settings.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default ProfileEdit;
