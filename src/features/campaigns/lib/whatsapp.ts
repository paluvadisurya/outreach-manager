/**
 * Build a wa.me deep link with a prefilled message. The application never sends
 * automatically — this link opens WhatsApp with the message ready, and the user
 * presses send manually. That is intentional.
 */
export function buildWaLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${digits}?text=${text}`;
}
