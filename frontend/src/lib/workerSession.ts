const WORKER_TOKEN_KEY = "mv_radnik_token";
const WORKER_INFO_KEY = "mv_radnik_info";

export interface WorkerInfo {
  radnik: { id: string; ime: string };
  prodavnica: { id: string; naziv: string; slug: string };
}

export function saveWorkerSession(token: string, info: WorkerInfo) {
  localStorage.setItem(WORKER_TOKEN_KEY, token);
  localStorage.setItem(WORKER_INFO_KEY, JSON.stringify(info));
}

export function getWorkerToken(): string | null {
  return localStorage.getItem(WORKER_TOKEN_KEY);
}

export function getWorkerInfo(): WorkerInfo | null {
  const raw = localStorage.getItem(WORKER_INFO_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearWorkerSession() {
  localStorage.removeItem(WORKER_TOKEN_KEY);
  localStorage.removeItem(WORKER_INFO_KEY);
}
