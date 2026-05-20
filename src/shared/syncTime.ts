export function formatLastSync(iso: string | null | undefined): string {
  if (!iso) return "Never";
  try {
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    if (diffMs < 0) return new Date(iso).toLocaleString();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 48) return `${hr}h ago`;
    return new Date(iso).toLocaleString();
  } catch {
    return iso ?? "Never";
  }
}
