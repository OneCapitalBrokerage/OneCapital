import { normalizeQrDisplaySettings } from '../../utils/qrDisplay';

const QrCodeFrame = ({
  src,
  settings,
  alt = 'QR code',
  className = '',
  imageClassName = '',
  emptyLabel = 'QR not available',
}) => {
  const normalized = normalizeQrDisplaySettings(settings);
  const inset = `${normalized.padding}%`;

  return (
    <div className={`relative aspect-square overflow-hidden bg-white ${className}`.trim()}>
      {src ? (
        <div className="absolute inset-0 bg-white">
          <div className="absolute overflow-hidden" style={{ inset }}>
            <img
              src={src}
              alt={alt}
              draggable={false}
              className={`absolute h-full w-full select-none object-contain ${imageClassName}`.trim()}
              style={{
                left: `calc(50% + ${normalized.offsetX}%)`,
                top: `calc(50% + ${normalized.offsetY}%)`,
                transform: `translate(-50%, -50%) scale(${normalized.scale})`,
                transformOrigin: 'center center',
              }}
            />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f6f7f8] px-4 text-center text-xs font-medium text-[#617589]">
          {emptyLabel}
        </div>
      )}
    </div>
  );
};

export default QrCodeFrame;
