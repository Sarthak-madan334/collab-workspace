export function buildWhatsAppShareUrl(origin, inviteCode) {
  const joinUrl = `${origin}/join/${encodeURIComponent(inviteCode)}`;
  const message = `Join my Synkro workspace: ${joinUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildFileInviteUrl(origin, inviteCode, roomId, fileId) {
  const url = new URL(`/join/${encodeURIComponent(inviteCode)}`, origin);
  url.searchParams.set('roomId', roomId);
  url.searchParams.set('fileId', fileId);
  return url.toString();
}

export function getInviteDestination(joinedRoomId, targetRoomId, targetFileId) {
  if (targetRoomId === joinedRoomId && targetFileId) {
    return `/studio/${encodeURIComponent(joinedRoomId)}/${encodeURIComponent(targetFileId)}`;
  }
  return `/rooms/${encodeURIComponent(joinedRoomId)}`;
}
