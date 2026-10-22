/** Calendar dates in the viewer’s local timezone, including a weekend in progress. */
export function upcomingWeekends(today = new Date(), count = 12) {
  const saturday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const day = saturday.getDay();
  saturday.setDate(saturday.getDate() + (day === 0 ? -1 : (6 - day + 7) % 7));
  const date = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(saturday); start.setDate(start.getDate() + index * 7);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { start: date(start), end: date(end) };
  });
}
