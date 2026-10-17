const CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // excludes 0/O/1/I to avoid confusion at the register

function randomChars(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return s;
}

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** Short human-friendly order code shown at the register and tracked by the customer, e.g. "K7F-42". */
export function generateOrderCode(): string {
  return `${randomChars(3)}-${randomDigits(2)}`;
}
