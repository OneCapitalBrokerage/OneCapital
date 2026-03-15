import QrCodeFrame from '../../../components/shared/QrCodeFrame';
import {
  DEFAULT_QR_DISPLAY_SETTINGS,
  normalizeQrDisplaySettings,
} from '../../../utils/qrDisplay';

const CONTROL_COPY = [
  {
    key: 'scale',
    label: 'QR Size',
    min: 0.5,
    max: 2.5,
    step: 0.05,
    formatValue: (value) => `${value.toFixed(2)}x`,
  },
  {
    key: 'offsetX',
    label: 'Horizontal',
    min: -45,
    max: 45,
    step: 1,
    formatValue: (value) => `${value > 0 ? '+' : ''}${Math.round(value)}%`,
  },
  {
    key: 'offsetY',
    label: 'Vertical',
    min: -45,
    max: 45,
    step: 1,
    formatValue: (value) => `${value > 0 ? '+' : ''}${Math.round(value)}%`,
  },
  {
    key: 'padding',
    label: 'Frame Padding',
    min: 0,
    max: 24,
    step: 1,
    formatValue: (value) => `${Math.round(value)}%`,
  },
];

const BrokerQrEditorModal = ({
  open,
  sourceUrl,
  settings,
  saving = false,
  onChange,
  onClose,
  onReset,
  onSave,
}) => {
  if (!open) return null;

  const normalized = normalizeQrDisplaySettings(settings || DEFAULT_QR_DISPLAY_SETTINGS);

  const handleChange = (field) => (event) => {
    onChange({
      ...normalized,
      [field]: Number(event.target.value),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-[#111418]">Official QR Layout</p>
              <p className="mt-1 text-sm text-[#617589]">
                Upload your broker-issued QR and adjust its framing. This preview matches what clients will see.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-[#617589] transition-colors hover:bg-[#f6f7f8] hover:text-[#111418]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_320px] sm:px-6">
          <div className="space-y-4">
            <div className="rounded-3xl border border-gray-200 bg-[#f8fafb] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#617589]">Client Preview</p>
              <div className="mt-4 rounded-[28px] border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-[#111418]">Pay to Broker UPI</p>
                <p className="mt-1 text-xs text-[#617589]">Only the uploaded QR is shown. No generated QR fallback is used.</p>
                <QrCodeFrame
                  src={sourceUrl}
                  settings={normalized}
                  alt="Broker payment QR preview"
                  className="mt-4 w-full rounded-2xl border border-gray-200 shadow-sm"
                  emptyLabel="Upload an official QR image to continue."
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[#dce8ff] bg-[#f5f9ff] px-4 py-3 text-[13px] text-[#36506d]">
              Keep the QR sharp and centered. Avoid over-cropping finder corners, logos, or quiet white margins that your payment app needs to scan reliably.
            </div>
          </div>

          <div className="space-y-4">
            {CONTROL_COPY.map((control) => (
              <label key={control.key} className="block rounded-2xl border border-gray-200 bg-[#fbfcfd] px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#111418]">{control.label}</span>
                  <span className="text-xs font-semibold text-[#617589]">{control.formatValue(normalized[control.key])}</span>
                </div>
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={normalized[control.key]}
                  onChange={handleChange(control.key)}
                  className="h-2 w-full cursor-pointer accent-[#137fec]"
                />
              </label>
            ))}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onReset}
                disabled={saving}
                className="h-11 flex-1 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-[#111418] disabled:opacity-60"
              >
                Reset
              </button>
              <button
                onClick={onSave}
                disabled={saving || !sourceUrl}
                className="h-11 flex-[1.4] rounded-xl bg-[#137fec] text-sm font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save QR'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrokerQrEditorModal;
