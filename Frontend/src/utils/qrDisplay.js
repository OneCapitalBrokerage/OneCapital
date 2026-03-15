const QR_SETTINGS_LIMITS = {
  scale: { min: 0.5, max: 2.5, fallback: 1 },
  offset: { min: -45, max: 45, fallback: 0 },
  padding: { min: 0, max: 24, fallback: 8 },
};

const clampNumber = (value, limits) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return limits.fallback;
  return Math.min(limits.max, Math.max(limits.min, parsed));
};

export const DEFAULT_QR_DISPLAY_SETTINGS = Object.freeze({
  scale: QR_SETTINGS_LIMITS.scale.fallback,
  offsetX: QR_SETTINGS_LIMITS.offset.fallback,
  offsetY: QR_SETTINGS_LIMITS.offset.fallback,
  padding: QR_SETTINGS_LIMITS.padding.fallback,
});

export const normalizeQrDisplaySettings = (value = {}) => ({
  scale: clampNumber(value.scale, QR_SETTINGS_LIMITS.scale),
  offsetX: clampNumber(value.offsetX ?? value.offset_x, QR_SETTINGS_LIMITS.offset),
  offsetY: clampNumber(value.offsetY ?? value.offset_y, QR_SETTINGS_LIMITS.offset),
  padding: clampNumber(value.padding, QR_SETTINGS_LIMITS.padding),
});
