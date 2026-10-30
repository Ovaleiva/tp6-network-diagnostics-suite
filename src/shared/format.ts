function pad(value: number) {
  return String(value).padStart(2, '0');
}

// Fecha local legible para el técnico: DD/MM/AAAA HH:MM.
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
