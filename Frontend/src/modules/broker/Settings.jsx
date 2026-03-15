import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import brokerApi from '../../api/broker';
import { useBrokerAuth } from '../../context/BrokerContext';
import QrCodeFrame from '../../components/shared/QrCodeFrame';
import BrokerQrEditorModal from './components/BrokerQrEditorModal';
import {
  DEFAULT_QR_DISPLAY_SETTINGS,
  normalizeQrDisplaySettings,
} from '../../utils/qrDisplay';
import {
  BANK_TRANSFER_METHODS,
  DEFAULT_BANK_TRANSFER_DETAILS,
  hasBankTransferDetails,
  normalizeBankTransferDetails,
} from '../../utils/paymentIntake';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const getIstClockDate = (date = new Date()) => new Date(date.getTime() + IST_OFFSET_MS);

const isSettlementWeekendOpen = (date = new Date()) => {
  const istClock = getIstClockDate(date);
  const day = istClock.getUTCDay();
  return day === 6 || day === 0;
};

const getNextSundayIst = (date = new Date()) => {
  const istClock = getIstClockDate(date);
  const day = istClock.getUTCDay(); // 0=Sun ... 6=Sat
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const nextSunday = new Date(istClock);
  nextSunday.setUTCDate(nextSunday.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(0, 0, 0, 0);
  return new Date(nextSunday.getTime() - IST_OFFSET_MS);
};

const Settings = () => {
  const navigate = useNavigate();
  const { logout } = useBrokerAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrRemoving, setQrRemoving] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const qrFileRef = useRef(null);
  const [qrEditorOpen, setQrEditorOpen] = useState(false);
  const [qrEditorSourceUrl, setQrEditorSourceUrl] = useState('');
  const [qrEditorSettings, setQrEditorSettings] = useState(DEFAULT_QR_DISPLAY_SETTINGS);
  const [qrPendingFile, setQrPendingFile] = useState(null);
  const [qrPendingObjectUrl, setQrPendingObjectUrl] = useState('');
  const [bankTransferEditing, setBankTransferEditing] = useState(false);
  const [bankTransferSaving, setBankTransferSaving] = useState(false);
  const [bankTransferDraft, setBankTransferDraft] = useState(DEFAULT_BANK_TRANSFER_DETAILS);
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [settlementRunning, setSettlementRunning] = useState(false);
  const [settlementNotice, setSettlementNotice] = useState('');
  const [settlementConfig, setSettlementConfig] = useState({
    autoWeeklySettlementEnabled: true,
  });
  const [settlementHistory, setSettlementHistory] = useState([]);
  const [settlementWarning, setSettlementWarning] = useState(null);

  const [broker, setBroker] = useState({
    name: '',
    brokerId: '',
    companyName: '',
    isVerified: false,
    referenceCode: '',
  });
  const [codeCopied, setCodeCopied] = useState(false);

  const [clientInfo, setClientInfo] = useState({
    supportContact: '',
    qrPhotoUrl: '',
    qrPhotoPublicId: '',
    qrSettings: DEFAULT_QR_DISPLAY_SETTINGS,
    bankTransferDetails: DEFAULT_BANK_TRANSFER_DETAILS,
  });

  const settlementWindowOpen = isSettlementWeekendOpen();
  const hasConfiguredBankTransfer = hasBankTransferDetails(clientInfo.bankTransferDetails);

  const formatSettlementDate = (utcDate) =>
    utcDate.toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
    });

  const formatSettlementDateTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  };

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, settingsRes, historyRes] = await Promise.all([
        brokerApi.getProfile(),
        brokerApi.getSettings().catch(() => null),
        brokerApi.getWeeklySettlementHistory({ limit: 5 }).catch(() => ({ history: [] })),
      ]);

      const p = profileRes.profile || profileRes.broker || profileRes.data || profileRes;
      const settings = settingsRes?.settings || {};
      const settingsClientInfo = settings?.clientInfo || {};
      const settlement = settings?.settlement || {};

      setBroker({
        name: p.ownerName || p.name || p.owner_name || '',
        brokerId: p.brokerId || p.broker_id || p.id || '',
        companyName: p.companyName || p.company_name || '',
        isVerified: p.kyc_verified || p.isVerified || false,
        referenceCode: p.reference_code || p.referenceCode || '',
      });

      setClientInfo({
        supportContact: settingsClientInfo.supportContact || p.support_contact || p.supportContact || p.phone || '',
        qrPhotoUrl: settingsClientInfo.qrPhotoUrl || p.payment_qr_url || p.paymentQrUrl || '',
        qrPhotoPublicId: settingsClientInfo.qrPhotoPublicId || p.payment_qr_public_id || p.paymentQrPublicId || '',
        qrSettings: normalizeQrDisplaySettings(settingsClientInfo.qrSettings || p.payment_qr_settings || p.paymentQrSettings),
        bankTransferDetails: normalizeBankTransferDetails(settingsClientInfo.bankTransferDetails || p.bank_transfer_details || p.bankTransferDetails),
      });

      setSettlementConfig({
        autoWeeklySettlementEnabled: settlement.autoWeeklySettlementEnabled !== false,
      });
      setSettlementHistory(historyRes?.history || []);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => () => {
    if (qrPendingObjectUrl) {
      URL.revokeObjectURL(qrPendingObjectUrl);
    }
  }, [qrPendingObjectUrl]);

  const handleSaveClientInfo = async (field, value) => {
    setSaving(true);
    try {
      const updated = { ...clientInfo, [field]: value };
      const response = await brokerApi.updateClientInfo({
        supportContact: updated.supportContact,
        qrPhotoUrl: updated.qrPhotoUrl,
      });
      const savedClientInfo = response?.clientInfo || {};
      setClientInfo((prev) => ({
        ...updated,
        qrPhotoPublicId: savedClientInfo.qrPhotoPublicId ?? prev.qrPhotoPublicId,
        qrSettings: normalizeQrDisplaySettings(savedClientInfo.qrSettings ?? prev.qrSettings),
        bankTransferDetails: normalizeBankTransferDetails(savedClientInfo.bankTransferDetails ?? prev.bankTransferDetails),
      }));
      setEditingField(null);
    } catch (err) {
      console.error('Failed to save client info:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = () => {
    if (!broker.referenceCode) return;
    navigator.clipboard.writeText(broker.referenceCode).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/broker/login');
  };

  const refreshSettlementHistory = useCallback(async () => {
    try {
      const historyRes = await brokerApi.getWeeklySettlementHistory({ limit: 5 });
      setSettlementHistory(historyRes?.history || []);
    } catch (err) {
      console.error('Failed to fetch settlement history:', err);
    }
  }, []);

  const doToggleAutoSettlement = async () => {
    const nextValue = !settlementConfig.autoWeeklySettlementEnabled;
    setSettlementSaving(true);
    setSettlementNotice('');
    try {
      await brokerApi.updateSettings({
        settlement: {
          autoWeeklySettlementEnabled: nextValue,
        },
      });
      setSettlementConfig({ autoWeeklySettlementEnabled: nextValue });
      setSettlementNotice(
        nextValue
          ? 'Auto weekly settlement enabled (Sunday 00:00 IST).'
          : 'Auto weekly settlement disabled. Manual settlement required.'
      );
    } catch (err) {
      console.error('Failed to update auto settlement setting:', err);
      setSettlementNotice('Failed to update auto settlement setting.');
    } finally {
      setSettlementSaving(false);
    }
  };

  const handleToggleAutoSettlement = () => {
    const nextValue = !settlementConfig.autoWeeklySettlementEnabled;
    if (!nextValue) {
      // Disabling is safe — no warning needed
      doToggleAutoSettlement();
      return;
    }
    const nextSunday = getNextSundayIst();
    setSettlementWarning({
      title: 'Enable Auto Settlement for All Clients?',
      mode: 'auto_enable',
      nextRunLabel: formatSettlementDate(nextSunday),
      onConfirm: doToggleAutoSettlement,
    });
  };

  const doRunWeeklySettlement = async () => {
    if (!settlementWindowOpen) {
      setSettlementNotice('Manual settlement is available only on Saturday and Sunday (IST).');
      return;
    }
    setSettlementRunning(true);
    setSettlementNotice('');
    try {
      const res = await brokerApi.runWeeklySettlement({});
      setSettlementNotice(res?.message || 'Weekly settlement completed.');
      await refreshSettlementHistory();
    } catch (err) {
      console.error('Failed to run weekly settlement:', err);
      setSettlementNotice(err?.message || 'Failed to run weekly settlement.');
    } finally {
      setSettlementRunning(false);
    }
  };

  const handleRunWeeklySettlement = () => {
    if (!settlementWindowOpen) {
      setSettlementNotice('Manual settlement is available only on Saturday and Sunday (IST).');
      return;
    }
    const nextSunday = getNextSundayIst();
    setSettlementWarning({
      title: 'Run Settlement for All Clients?',
      mode: 'run_all',
      nextRunLabel: formatSettlementDate(nextSunday),
      onConfirm: doRunWeeklySettlement,
    });
  };

  const uploadQrToCloudinary = async (file) => {
    const sigRes = await brokerApi.getClientInfoUploadSignature();
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
    if (!data.secure_url) {
      throw new Error('QR upload failed');
    }
    return { url: data.secure_url, publicId: data.public_id };
  };

  const resetQrEditorState = useCallback(() => {
    setQrEditorOpen(false);
    setQrEditorSourceUrl('');
    setQrEditorSettings(DEFAULT_QR_DISPLAY_SETTINGS);
    setQrPendingFile(null);

    if (qrPendingObjectUrl) {
      URL.revokeObjectURL(qrPendingObjectUrl);
      setQrPendingObjectUrl('');
    }
  }, [qrPendingObjectUrl]);

  const openExistingQrEditor = () => {
    if (!clientInfo.qrPhotoUrl) return;
    setQrPendingFile(null);
    setQrEditorSourceUrl(clientInfo.qrPhotoUrl);
    setQrEditorSettings(normalizeQrDisplaySettings(clientInfo.qrSettings));
    setQrEditorOpen(true);
  };

  const handleQrFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (qrPendingObjectUrl) {
      URL.revokeObjectURL(qrPendingObjectUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setQrPendingObjectUrl(objectUrl);
    setQrPendingFile(file);
    setQrEditorSourceUrl(objectUrl);
    setQrEditorSettings(DEFAULT_QR_DISPLAY_SETTINGS);
    setQrEditorOpen(true);
  };

  const handleSaveQrEditor = async () => {
    if (!qrEditorSourceUrl) return;

    setQrUploading(true);
    let uploadedAsset = null;
    try {
      if (qrPendingFile) {
        uploadedAsset = await uploadQrToCloudinary(qrPendingFile);
      }

      const payload = {
        qrSettings: qrEditorSettings,
      };
      if (uploadedAsset) {
        payload.qrPhotoUrl = uploadedAsset.url;
        payload.qrPhotoPublicId = uploadedAsset.publicId;
      }

      const response = await brokerApi.updateClientInfo(payload);

      const savedClientInfo = response?.clientInfo || {};
      setClientInfo((prev) => ({
        ...prev,
        qrPhotoUrl: savedClientInfo.qrPhotoUrl ?? uploadedAsset?.url ?? prev.qrPhotoUrl,
        qrPhotoPublicId: savedClientInfo.qrPhotoPublicId ?? uploadedAsset?.publicId ?? prev.qrPhotoPublicId,
        qrSettings: normalizeQrDisplaySettings(savedClientInfo.qrSettings ?? qrEditorSettings),
      }));
      resetQrEditorState();
    } catch (err) {
      if (uploadedAsset?.publicId) {
        try {
          await brokerApi.discardClientInfoQrUpload(uploadedAsset.publicId);
        } catch (cleanupErr) {
          console.error('Failed to discard unsaved QR upload:', cleanupErr);
        }
      }
      console.error('Failed to save QR photo:', err);
    } finally {
      setQrUploading(false);
    }
  };

  const handleRemoveQr = async () => {
    if (!clientInfo.qrPhotoUrl && !clientInfo.qrPhotoPublicId) return;
    setQrRemoving(true);
    try {
      await brokerApi.updateClientInfo({
        qrPhotoUrl: '',
        qrPhotoPublicId: '',
        qrSettings: DEFAULT_QR_DISPLAY_SETTINGS,
      });
      resetQrEditorState();
      setClientInfo((prev) => ({
        ...prev,
        qrPhotoUrl: '',
        qrPhotoPublicId: '',
        qrSettings: DEFAULT_QR_DISPLAY_SETTINGS,
      }));
    } catch (err) {
      console.error('Failed to remove QR photo:', err);
    } finally {
      setQrRemoving(false);
    }
  };

  const openBankTransferEditor = () => {
    setBankTransferDraft(normalizeBankTransferDetails(clientInfo.bankTransferDetails));
    setBankTransferEditing(true);
  };

  const handleBankTransferDraftChange = (field, value) => {
    setBankTransferDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveBankTransferDetails = async () => {
    setBankTransferSaving(true);
    try {
      const normalized = normalizeBankTransferDetails(bankTransferDraft);
      const response = await brokerApi.updateClientInfo({
        bankTransferDetails: normalized,
      });
      const savedClientInfo = response?.clientInfo || {};
      const savedBankTransferDetails = normalizeBankTransferDetails(
        savedClientInfo.bankTransferDetails ?? normalized
      );
      setClientInfo((prev) => ({
        ...prev,
        bankTransferDetails: savedBankTransferDetails,
      }));
      setBankTransferDraft(savedBankTransferDetails);
      setBankTransferEditing(false);
    } catch (err) {
      console.error('Failed to save bank transfer details:', err);
    } finally {
      setBankTransferSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#f6f7f8] pb-20">
        <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
          <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3">
            <h1 className="text-lg sm:text-xl font-bold">Settings</h1>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-32 mb-3"></div>
              <div className="h-4 bg-gray-200 rounded w-48"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col min-h-screen bg-[#f6f7f8] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="flex items-center px-3 sm:px-4 py-2.5 sm:py-3">
          <h1 className="text-lg sm:text-xl font-bold leading-tight">Settings</h1>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-3 sm:p-4 gap-5 overflow-y-auto">
        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex p-3 sm:p-4 items-center gap-3">
            <div className="bg-[#137fec] rounded-full h-14 w-14 shrink-0 flex items-center justify-center">
              <span className="text-white text-lg font-bold">
                {broker.name ? broker.name.split(' ').map(n => n[0]).join('').toUpperCase() : '?'}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-base font-bold">{broker.name || 'Broker'}</p>
                {broker.isVerified && <span className="material-symbols-outlined text-[#137fec] text-[14px]">verified</span>}
              </div>
              {broker.companyName && <p className="text-[#617589] text-xs">{broker.companyName}</p>}
              <p className="text-[#617589] text-xs">ID: {broker.brokerId}</p>
            </div>
          </div>
        </div>

        {/* Registration Reference Code */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[#617589] text-[10px] font-semibold uppercase tracking-wider pl-2">Registration</h3>
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4">
            <p className="text-sm font-semibold mb-0.5">Broker Reference Code</p>
            <p className="text-[#617589] text-xs mb-3">
              Share this code with prospective clients so their registration reaches your panel automatically.
            </p>
            {broker.referenceCode ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#f6f7f8] rounded-lg px-4 py-2.5 flex items-center">
                  <span className="font-mono text-lg font-bold tracking-widest text-[#111418]">
                    {broker.referenceCode}
                  </span>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="h-10 px-3 bg-[#137fec] text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-[#137fec]/90 transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {codeCopied ? 'check' : 'content_copy'}
                  </span>
                  {codeCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#617589] italic">Code not assigned yet. Contact admin.</p>
            )}
          </div>
        </div>

        {/* Client Facing Info */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[#617589] text-[10px] font-semibold uppercase tracking-wider pl-2">Client Facing Info</h3>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {/* Support Contact */}
            <div className="px-3 py-3 flex items-center justify-between">
              {editingField === 'supportContact' ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="flex-1 h-9 px-3 rounded-lg bg-[#f6f7f8] text-sm outline-none border border-[#137fec]"
                    placeholder="Support contact number"
                  />
                  <button
                    onClick={() => handleSaveClientInfo('supportContact', editValue)}
                    disabled={saving}
                    className="h-9 px-3 bg-[#137fec] text-white text-xs font-bold rounded-lg"
                  >
                    {saving ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingField(null)} className="h-9 px-2 text-[#617589]">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium">Broker Contact Number</p>
                    <p className="text-[#617589] text-xs">{clientInfo.supportContact || 'Not set'}</p>
                  </div>
                  <button onClick={() => { setEditingField('supportContact'); setEditValue(clientInfo.supportContact); }} className="text-[#137fec] opacity-60 hover:opacity-100">
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </>
              )}
            </div>

            {/* QR Photo */}
            <div className="px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Fund Transfer QR Photo</p>
                  <p className="text-[#617589] text-xs">
                    {clientInfo.qrPhotoUrl ? 'Official QR uploaded' : 'No QR uploaded yet'}
                  </p>
                </div>
                <input
                  ref={qrFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={handleQrFileChange}
                />
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                <QrCodeFrame
                  src={clientInfo.qrPhotoUrl}
                  settings={clientInfo.qrSettings}
                  alt="Broker QR"
                  className="w-40 rounded-2xl border border-gray-200 shadow-sm"
                  emptyLabel="Official QR not uploaded"
                />

                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-[#617589]">
                    Upload only the official broker QR issued by your payment app or bank. Clients will never see a generated fallback QR.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => qrFileRef.current?.click()}
                      disabled={qrUploading || qrRemoving}
                      className="h-9 px-3 bg-[#137fec] text-white text-xs font-bold rounded-lg disabled:opacity-60"
                    >
                      {qrUploading ? 'Saving QR...' : clientInfo.qrPhotoUrl ? 'Replace QR' : 'Upload QR'}
                    </button>
                    {clientInfo.qrPhotoUrl && (
                      <button
                        onClick={openExistingQrEditor}
                        disabled={qrUploading || qrRemoving}
                        className="h-9 px-3 bg-white border border-gray-200 text-[#111418] text-xs font-bold rounded-lg disabled:opacity-60"
                      >
                        Adjust Layout
                      </button>
                    )}
                    {clientInfo.qrPhotoUrl && (
                      <button
                        onClick={handleRemoveQr}
                        disabled={qrUploading || qrRemoving}
                        className="h-9 px-3 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-lg disabled:opacity-60"
                      >
                        {qrRemoving ? 'Removing...' : 'Remove QR'}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#617589]">
                    Use layout controls to resize, crop, and align the uploaded QR without generating a new QR code.
                  </p>
                </div>
              </div>
            </div>

            {/* Bank Transfer */}
            <div className="px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Bank Transfer Details</p>
                  <p className="text-[#617589] text-xs">
                    {hasConfiguredBankTransfer
                      ? 'RTGS / NEFT / IMPS details visible to clients'
                      : 'Bank transfer details not configured'}
                  </p>
                </div>
                {!bankTransferEditing && (
                  <button
                    onClick={openBankTransferEditor}
                    className="h-9 px-3 bg-white border border-gray-200 text-[#111418] text-xs font-bold rounded-lg"
                  >
                    {hasConfiguredBankTransfer ? 'Edit' : 'Add'}
                  </button>
                )}
              </div>

              <div className="mt-3 rounded-2xl border border-gray-200 bg-[#fafbfc] p-3">
                <div className="flex flex-wrap gap-2">
                  {BANK_TRANSFER_METHODS.map((method) => (
                    <span
                      key={method}
                      className="rounded-full bg-[#eaf4ff] px-2.5 py-1 text-[11px] font-semibold text-[#137fec]"
                    >
                      {method.toUpperCase()}
                    </span>
                  ))}
                </div>

                {bankTransferEditing ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#617589]">
                          Bank Name
                        </label>
                        <input
                          value={bankTransferDraft.bankName}
                          onChange={(event) => handleBankTransferDraftChange('bankName', event.target.value)}
                          placeholder="Optional"
                          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#111418] outline-none focus:border-[#137fec]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#617589]">
                          Account Holder
                        </label>
                        <input
                          value={bankTransferDraft.accountHolderName}
                          onChange={(event) => handleBankTransferDraftChange('accountHolderName', event.target.value)}
                          placeholder="Optional"
                          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#111418] outline-none focus:border-[#137fec]"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#617589]">
                          Account Number
                        </label>
                        <input
                          value={bankTransferDraft.accountNumber}
                          onChange={(event) => handleBankTransferDraftChange('accountNumber', event.target.value.replace(/\s+/g, ''))}
                          placeholder="Required for bank transfer"
                          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#111418] outline-none focus:border-[#137fec]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#617589]">
                          IFSC Code
                        </label>
                        <input
                          value={bankTransferDraft.ifscCode}
                          onChange={(event) => handleBankTransferDraftChange('ifscCode', event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                          placeholder="Required"
                          className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm uppercase text-[#111418] outline-none focus:border-[#137fec]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#617589]">
                        Account Type
                      </label>
                      <div className="flex gap-2">
                        {['current', 'savings'].map((type) => (
                          <button
                            key={type}
                            onClick={() => handleBankTransferDraftChange('accountType', type)}
                            className={`h-10 flex-1 rounded-xl border text-sm font-semibold transition-colors ${
                              bankTransferDraft.accountType === type
                                ? 'border-[#137fec] bg-[#137fec] text-white'
                                : 'border-gray-200 bg-white text-[#111418]'
                            }`}
                          >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => setBankTransferEditing(false)}
                        disabled={bankTransferSaving}
                        className="h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-[#111418] disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveBankTransferDetails}
                        disabled={bankTransferSaving}
                        className="h-10 px-4 rounded-xl bg-[#137fec] text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {bankTransferSaving ? 'Saving...' : 'Save Bank Details'}
                      </button>
                    </div>
                  </div>
                ) : hasConfiguredBankTransfer ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#617589]">Account Number</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-[#111418] break-all">
                        {clientInfo.bankTransferDetails.accountNumber}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#617589]">IFSC Code</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-[#111418]">
                        {clientInfo.bankTransferDetails.ifscCode}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#617589]">Bank Name</p>
                      <p className="mt-1 text-sm font-semibold text-[#111418]">
                        {clientInfo.bankTransferDetails.bankName || 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#617589]">Account Holder</p>
                      <p className="mt-1 text-sm font-semibold text-[#111418]">
                        {clientInfo.bankTransferDetails.accountHolderName || 'Not set'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-[11px] text-[#617589]">
                    Add account number and IFSC code to display professional RTGS, NEFT, and IMPS transfer instructions to clients.
                  </p>
                )}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-[#617589] px-2">
            Upload a UPI QR code so clients can scan and pay instantly. If bank transfer details are configured, clients will also see RTGS, NEFT, and IMPS account instructions.
          </p>
        </div>

        {/* Weekly Settlement */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[#617589] text-[10px] font-semibold uppercase tracking-wider pl-2">Weekly Settlement</h3>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
            <div className="px-3 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Auto Settlement (Sunday 00:00 IST)</p>
                <p className="text-[#617589] text-xs">
                  {settlementConfig.autoWeeklySettlementEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <button
                onClick={handleToggleAutoSettlement}
                disabled={settlementSaving || settlementRunning}
                className={`h-9 px-3 text-xs font-bold rounded-lg disabled:opacity-60 ${
                  settlementConfig.autoWeeklySettlementEnabled
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-[#137fec] text-white'
                }`}
              >
                {settlementSaving
                  ? 'Saving...'
                  : settlementConfig.autoWeeklySettlementEnabled
                    ? 'Disable Auto'
                    : 'Enable Auto'}
              </button>
            </div>

            <div className="px-3 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Manual Weekly Settlement</p>
                <p className="text-[#617589] text-xs">
                  Use this during Saturday/Sunday when you need to settle clear clients before or after the Sunday auto run.
                </p>
              </div>
              <button
                onClick={handleRunWeeklySettlement}
                disabled={settlementRunning || settlementSaving || !settlementWindowOpen}
                className="h-9 px-3 bg-[#137fec] text-white text-xs font-bold rounded-lg disabled:opacity-60"
              >
                {settlementRunning ? 'Running...' : 'Run Now'}
              </button>
            </div>
            {!settlementWindowOpen && (
              <div className="px-3 pb-3 -mt-1">
                <p className="text-[11px] text-amber-700">
                  Manual settlement is available only on Saturday and Sunday (IST).
                </p>
              </div>
            )}

            <div className="px-3 py-3">
              <p className="text-xs font-semibold text-[#617589] uppercase tracking-wider mb-2">Recent Runs</p>
              {settlementHistory.length === 0 ? (
                <p className="text-[#617589] text-xs">No settlement runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {settlementHistory.map((row) => (
                    <div key={row.runRef} className="rounded-lg border border-gray-100 bg-[#f6f7f8] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[#111418] truncate">{row.runRef}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          row.mode === 'auto' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#eaf4ff] text-[#137fec]'
                        }`}>
                          {row.mode === 'auto' ? 'AUTO' : 'MANUAL'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#617589] mt-0.5">
                        Settled: {formatSettlementDateTime(row.settledAt)}
                      </p>
                      <p className="text-[11px] text-[#617589]">
                        Clients: {row.customersAffected || 0} | Total: ₹{Number(row.totalAmount || 0).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {settlementNotice && (
                <p className="text-[11px] text-[#137fec] mt-2">{settlementNotice}</p>
              )}
            </div>
          </div>
        </div>

        {/* Logout */}
        <div className="mt-3 flex flex-col items-center gap-3">
          <button
            onClick={handleLogout}
            className="w-full bg-white text-red-500 font-semibold py-3 rounded-xl shadow-sm active:scale-[0.99] transition-transform flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Logout
          </button>
          <p className="text-[10px] text-[#617589]">OneCapital Broker v2.4.1</p>
        </div>
      </div>
    </div>

    <BrokerQrEditorModal
      open={qrEditorOpen}
      sourceUrl={qrEditorSourceUrl}
      settings={qrEditorSettings}
      saving={qrUploading}
      onChange={setQrEditorSettings}
      onClose={resetQrEditorState}
      onReset={() => setQrEditorSettings(DEFAULT_QR_DISPLAY_SETTINGS)}
      onSave={handleSaveQrEditor}
    />

    {/* Settlement Warning Modal */}
    {settlementWarning && (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-amber-50 border-b border-amber-100 px-5 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="size-11 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="material-symbols-outlined text-amber-600 text-[22px]">warning</span>
              </div>
              <div>
                <p className="text-[#111418] font-bold text-base leading-snug">{settlementWarning.title}</p>
                <p className="text-amber-700 text-xs font-medium mt-0.5">Review carefully before proceeding</p>
              </div>
            </div>
          </div>

          {/* Warning Body */}
          <div className="px-5 py-4 space-y-3">
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <p className="text-red-700 text-xs font-bold uppercase tracking-wider mb-2">This action will reset:</p>
              <ul className="space-y-1.5">
                {[
                  'Net Cash P&L balance → resets to ₹0 for affected clients',
                  'This week portfolio realized P&L counter → restarts from this point',
                  'Weekly session boundary → new session begins from settlement timestamp',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-red-700">
                    <span className="material-symbols-outlined text-red-500 text-[13px] mt-0.5 shrink-0">cancel</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <p className="text-[#137fec] text-xs font-bold uppercase tracking-wider mb-1.5">Next Auto-Run</p>
              <p className="text-[#111418] text-sm font-bold">{settlementWarning.nextRunLabel}</p>
              <p className="text-[#617589] text-xs mt-0.5">at 12:00 AM IST (Sunday)</p>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 space-y-1.5">
              {[
                'Contact each client before running settlement.',
                'Ensure losses are recovered or profits are transferred.',
                'Open holdings and open-order unrealized P&L stay live after reset.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 text-xs text-amber-800">
                  <span className="material-symbols-outlined text-amber-500 text-[13px] mt-0.5 shrink-0">info</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pb-6 pt-1 flex gap-3">
            <button
              onClick={() => setSettlementWarning(null)}
              className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const fn = settlementWarning.onConfirm;
                setSettlementWarning(null);
                fn();
              }}
              className="flex-1 h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm"
            >
              Proceed Anyway
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Settings;
