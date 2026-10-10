export const iso = d => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

export function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}

export function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
export function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      row.push(addDays(start, w * 7 + d));
    }
    weeks.push(row);
  }
  return weeks;
}