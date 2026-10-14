/** Prefixed, sortable, collision-resistant IDs: e.g. "bk_lz3k9x_4f2a1c". */
let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1296;
  const time = Date.now().toString(36);
  const rand = Array.from(cryptoBytes(4), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${time}${counter.toString(36).padStart(2, '0')}_${rand}`;
}

function cryptoBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(arr);
  else for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

/** Next sequential human-readable number, e.g. nextSequence(["M-0001","M-0007"], "M-") -> "M-0008". */
export function nextSequence(existing: string[], prefix: string, width = 4): string {
  let max = 0;
  for (const v of existing) {
    if (!v.startsWith(prefix)) continue;
    const n = Number(v.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}
