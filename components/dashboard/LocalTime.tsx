"use client";
// Renders a date as local time — avoids UTC mismatch from server rendering
export default function LocalTime({ date }: { date: string | Date }) {
  const d = typeof date === "string" ? new Date(date) : date;
  return <>{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>;
}
