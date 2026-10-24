// Unit doubles for named operator authentication. The property suite uses real
// signed sessions and the real operators table, including denied identities.
import { operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
const secret = 'synthetic-ticket-unit-secret';
const id = 'synthetic-ticket-operator';
export async function operatorContext(context) {
  const cookie = `kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret, id)}`;
  const request = context.request || new Request('https://kiwi.test/api/tickets');
  request.headers.set('Cookie', cookie);
  const DB = context.env.DB;
  return { ...context, request, env: { ...context.env, AUTH_SECRET: secret, DB: {
    ...DB,
    prepare(sql) {
      if (sql === 'SELECT id FROM operators WHERE id = ?') return { bind(value) { return { first: async () => value === id ? { id } : null }; } };
      return DB.prepare(sql);
    },
  } } };
}
export const asOperator = handler => async context => handler(await operatorContext(context));
