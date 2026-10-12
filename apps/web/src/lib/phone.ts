export function formatBrazilianPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55"))
    digits = digits.slice(2);
  digits = digits.slice(0, 11);
  const subscriberLength = digits.length === 10 ? 4 : 5;
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(new RegExp(`(\\d{${subscriberLength}})(\\d)`), "$1-$2");
}
