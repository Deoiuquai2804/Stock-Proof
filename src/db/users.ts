import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  name?: string,
) {
  try {
    const displayName = name?.trim() || email.split('@')[0] || 'Auditor';
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        name: displayName,
        role: 'auditor',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          name: displayName,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}
