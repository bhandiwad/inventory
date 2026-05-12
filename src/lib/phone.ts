export function normalizeIndianPhone(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const hasInternationalPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (hasInternationalPrefix) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

export function isLikelyE164Phone(phone: string) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
