function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatCommitTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function buildCommitMessage(folderName: string, date: Date = new Date()): string {
  return `vault-publisher: update ${folderName} - ${formatCommitTimestamp(date)}`;
}
