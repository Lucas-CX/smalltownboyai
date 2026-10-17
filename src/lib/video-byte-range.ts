// Single byte ranges, including suffix reads used to locate an MP4 index.
// Ignore unsupported/malformed ranges; distinguish valid but unsatisfiable ones.
export function videoByteRange(value: string | null, size: number) {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last))
    return undefined;
  if (!match[1]) {
    if (!last || !size) return null;
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (match[2] && last < first) return undefined;
  if (first >= size) return null;
  return { start: first, end: match[2] ? Math.min(last, size - 1) : size - 1 };
}
