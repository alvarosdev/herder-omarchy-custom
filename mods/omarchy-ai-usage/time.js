export const H = 3600e3, DAY = 24 * H;

export function pace(w) {
  const end = Date.parse(w.resets_at);
  if (!end || !w.span) return null;
  return Math.min(1, Math.max(0, 1 - (end - Date.now()) / w.span));
}

export function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function resets(w) {
  // The API reports resets a fraction of a second before the hour.
  const end = Math.round(Date.parse(w.resets_at) / 60e3) * 60e3;
  if (!end) return "";
  const left = Math.max(0, end - Date.now());
  if (left < DAY) {
    const h = Math.floor(left / H), m = Math.round((left % H) / 60e3);
    return `resets in ${h ? `${h}h ` : ""}${m}m, at ${clock(end)}`;
  }
  if (w.monthly) return `resets ${new Date(end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return `resets ${DAYS[new Date(end).getDay()]} at ${clock(end)}`;
}

export function resetsShort(w) {
  const end = Math.round(Date.parse(w.resets_at) / 60e3) * 60e3;
  if (!end) return "";
  const left = Math.max(0, end - Date.now());
  if (left >= 2 * DAY) return `${Math.round(left / DAY)}d`;
  return `${Math.floor(left / H)}h ${Math.floor((left % H) / 60e3)}m`;
}
