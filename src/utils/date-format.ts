function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface ParsedDate {
  date: Date;
  hasTime: boolean;
}

/**
 * Accepts:
 *  - "YYYY-MM-DD"
 *  - "YYYY-MM-DDTHH:MMZ"
 *  - "YYYY-MM-DDTHH:MM:SSZ"
 *  - "YYYY-MM-DDTHH:MM:SS+HH:MM"
 *  - ISO 8601 strings that Date can parse
 */
export function parsePostDate(
  input: string | Date | undefined,
): ParsedDate | null {
  if (!input) {
    return null;
  }

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return null;
    }
    return { date: input, hasTime: true };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  if (dateOnly) {
    const [year, month, day] = trimmed
      .split("-")
      .map((segment) => Number.parseInt(segment, 10));
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return { date, hasTime: false };
  }

  const candidate = new Date(trimmed);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return { date: candidate, hasTime: true };
}

/**
 * Format to "YYYY-MM-DDTHH:MMZ" (UTC) -- matches existing apmoverflow datetimes.
 */
export function formatIsoMinutesZ(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hours = pad2(date.getUTCHours());
  const minutes = pad2(date.getUTCMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}Z`;
}

/**
 * Format to "Mon DD, YYYY" (UTC) -- matches existing apmoverflow display dates.
 */
export function formatDisplayDate(date: Date): string {
  const month = MONTH_NAMES[date.getUTCMonth()];
  const day = pad2(date.getUTCDate());
  const year = date.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}
