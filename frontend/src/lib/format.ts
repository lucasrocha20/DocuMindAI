// Issue dates are calendar dates (YYYY-MM-DD) with no time zone, so they are
// formatted in UTC to avoid shifting to the previous day in western zones.
const issueDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const quantityFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

export function formatIssueDate(isoDate: string): string {
  return issueDateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatDateTime(isoDateTime: string): string {
  return dateTimeFormat.format(new Date(isoDateTime));
}

export function formatQuantity(quantity: string): string {
  return quantityFormat.format(Number(quantity));
}

export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    // Intl rejects malformed currency codes; still show the amount.
    return `${currency} ${value.toFixed(2)}`;
  }
}
