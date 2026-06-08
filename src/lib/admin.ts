const API = '/api/admin/create-user';

export async function adminCreateUser(user: any, email: string, password: string, displayName: string, extra: Record<string, any> = {}): Promise<{ uid: string; isExisting: boolean }> {
  const idToken = await user.getIdToken();
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Fehler beim Erstellen');
  return { uid: data.uid, isExisting: data.isExisting };
}

export async function adminDeleteUser(user: any, uid?: string, email?: string): Promise<void> {
  const idToken = await user.getIdToken();
  await fetch(API, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, email }),
  });
}
