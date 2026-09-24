/** False means nothing was copied; callers must offer a manual-copy fallback. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}
