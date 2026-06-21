export interface LocalAuthUser {
  id: string;
  username: string;
  email?: string;
  role: 'guest' | 'user' | 'premium' | 'admin';
  createdAt: string;
}

const AUTH_STORAGE_KEY = 'canli11:auth-user:v1';

const now = () => new Date().toISOString();

const createId = () => `local-user-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;

const isAuthUser = (value: unknown): value is LocalAuthUser => {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<LocalAuthUser>;
  return Boolean(user.id && user.username && user.role && user.createdAt);
};

export const createLocalUser = (username = 'Canlı11 Menajeri'): LocalAuthUser => ({
  id: createId(),
  username: username.trim().slice(0, 24) || 'Canlı11 Menajeri',
  role: 'guest',
  createdAt: now(),
});

export const getCurrentUser = (): LocalAuthUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isAuthUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const saveCurrentUser = (user: LocalAuthUser) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
};

export const ensureLocalUser = (username?: string) => {
  const existing = getCurrentUser();
  if (existing) return existing;
  const user = createLocalUser(username);
  saveCurrentUser(user);
  return user;
};
