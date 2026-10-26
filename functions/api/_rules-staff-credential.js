// Preserve the server verifier precedence, including its trim after fallback.
export const canonicalCode = (member) => {
  return String((member && (member.pinCode || member.password)) || '').trim();
};

export const normalizeMember = (member) => {
  if (!member || typeof member !== 'object') return member;
  const pinCode = canonicalCode(member);
  return { ...member, pinCode, password: pinCode };
};
