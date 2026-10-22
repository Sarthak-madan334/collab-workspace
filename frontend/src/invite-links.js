export function buildWhatsAppShareUrl(origin, inviteCode) {
  const joinUrl = `${origin}/join/${encodeURIComponent(inviteCode)}`;
  const message = `Join my Synkro workspace: ${joinUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}