// perCall dollar amounts are routinely a fraction of a cent, which reads as
// "$0.0000375" and doesn't register as a real number. Finding.cost.per1000Calls
// is the same figure at a legible denomination; choosing decimals dynamically
// (so small amounts don't just render as "$0.00") keeps it readable without
// requiring the user to configure a real request volume first (that's atVolume).
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  const decimals = amount >= 1 ? 2 : Math.min(6, Math.max(2, 1 - Math.floor(Math.log10(amount))));
  return `$${amount.toFixed(decimals)}`;
}
