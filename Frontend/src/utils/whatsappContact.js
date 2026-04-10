const DEFAULT_COUNTRY_CODE = '91';

const toText = (value) => String(value || '').trim();

const normalizePhoneDigits = (value) => toText(value).replace(/[^0-9]/g, '');

const extractDigitsFromUrl = (value) => {
  const text = toText(value);
  if (!text) return '';

  const waMatch = text.match(/wa\.me\/(\d{7,15})/i);
  if (waMatch?.[1]) return waMatch[1];

  const phoneMatch = text.match(/phone=([0-9]{7,15})/i);
  if (phoneMatch?.[1]) return phoneMatch[1];

  return '';
};

const normalizeWhatsAppNumber = (value) => {
  const raw = toText(value);
  if (!raw) return '';

  const fromUrl = extractDigitsFromUrl(raw);
  if (fromUrl) return fromUrl;

  let digits = normalizePhoneDigits(raw);
  if (!digits) return '';

  if (digits.length === 10) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  if (digits.length < 11 || digits.length > 15) return '';
  return digits;
};

const formatSupportContact = (value) => {
  const text = toText(value);
  if (!text) return '';

  const normalized = normalizeWhatsAppNumber(text);
  if (!normalized) return text;

  if (normalized.startsWith(DEFAULT_COUNTRY_CODE) && normalized.length === 12) {
    return `+${normalized.slice(0, 2)} ${normalized.slice(2, 7)} ${normalized.slice(7)}`;
  }

  return `+${normalized}`;
};

const buildWhatsAppUrl = (contact, message = '') => {
  const normalized = normalizeWhatsAppNumber(contact);
  if (!normalized) return '';

  const base = `https://wa.me/${normalized}`;
  const text = toText(message);
  if (!text) return base;

  return `${base}?text=${encodeURIComponent(text)}`;
};

export {
  buildWhatsAppUrl,
  formatSupportContact,
  normalizeWhatsAppNumber,
};
