import { useMemo, useState } from 'react';

const DeleteBrokerConfirmModal = ({
  brokerName = '',
  customerCount = 0,
  deleting = false,
  onCancel,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState('');

  const normalizedConfirmText = useMemo(
    () => confirmText.trim().toUpperCase(),
    [confirmText]
  );

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[70] flex items-center justify-center p-4"
      onClick={() => !deleting && onCancel?.()}
    >
      <div
        className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center mb-4">
          <div className="size-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-red-600 text-[28px]">warning</span>
          </div>
          <h3 className="text-[#111418] text-lg font-bold mb-1">Delete Broker Permanently?</h3>
          <p className="text-[#617589] text-sm">
            Broker <span className="font-semibold text-[#111418]">{brokerName || 'N/A'}</span> and all related
            customer data will be deleted permanently.
          </p>
        </div>

        <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-3 mb-4">
          <p className="text-[11px] text-red-700 font-semibold">
            This includes {customerCount} customer account{customerCount === 1 ? '' : 's'}, funds, orders, KYC,
            watchlists, and history data.
          </p>
          <p className="text-[10px] text-red-600 mt-1">This action cannot be undone.</p>
        </div>

        <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
          Type DELETE to confirm
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white focus:border-red-400 focus:ring-2 focus:ring-red-200 outline-none"
          autoFocus
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 h-11 bg-gray-100 text-[#111418] rounded-xl font-bold text-sm disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting || normalizedConfirmText !== 'DELETE'}
            className="flex-1 h-11 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-60"
          >
            {deleting ? 'Deleting...' : 'Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteBrokerConfirmModal;
