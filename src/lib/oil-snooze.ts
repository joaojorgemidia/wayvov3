// Adiar o LEMBRETE de troca de óleo (não altera vencimento real).
// Apenas oculta da fila de cobranças até a data definida.
const KEY = "wayvo:oleo-snooze";

type SnoozeMap = Record<string, string>; // motoId -> YYYY-MM-DD (incl.)

function load(): SnoozeMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(map: SnoozeMap) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* noop */ }
  try { window.dispatchEvent(new Event("wayvo:oleo-snooze-changed")); } catch { /* noop */ }
}

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function getSnoozeUntil(motoId: string): string | null {
  const map = load();
  const v = map[motoId];
  if (!v) return null;
  // expira sozinho
  if (v < todayISO()) {
    delete map[motoId];
    save(map);
    return null;
  }
  return v;
}

export function isSnoozed(motoId: string): boolean {
  return getSnoozeUntil(motoId) !== null;
}

export function snoozeMoto(motoId: string, days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const map = load();
  map[motoId] = d.toISOString().slice(0, 10);
  save(map);
}

export function clearSnooze(motoId: string) {
  const map = load();
  if (map[motoId]) {
    delete map[motoId];
    save(map);
  }
}

export function onSnoozeChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("wayvo:oleo-snooze-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("wayvo:oleo-snooze-changed", handler);
    window.removeEventListener("storage", handler);
  };
}
