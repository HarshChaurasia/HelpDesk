const RT_KEY = 'hd_rt';

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(RT_KEY);
}

export function setStoredRefreshToken(t: string | null) {
  if (t) localStorage.setItem(RT_KEY, t);
  else localStorage.removeItem(RT_KEY);
}
