// Hotel-only metadata, preserved by every writer of the shared booking document.
export function stayOptions(h) {
  const time = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '';
  const id = typeof h?.dossierId === 'string' && /^[A-Za-z0-9:_-]{8,64}$/.test(h.dossierId) ? h.dossierId : '';
  const group = typeof h?.groupName === 'string' ? h.groupName.slice(0, 100) : '';
  return { dossierId: id, groupName: group, dayUse: h?.dayUse === true, arrivalTime: time(h?.arrivalTime), departureTime: time(h?.departureTime) };
}
