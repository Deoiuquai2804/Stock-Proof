import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  name?: string,
) {
  try {
    const displayName = name?.trim() || email.split('@')[0] || 'Kiểm toán viên';
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
    throw new Error('Không thể đồng bộ tài khoản người dùng.', { cause: error });
  }
}
