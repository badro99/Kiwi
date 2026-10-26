// Refuse incompatible deployments before route-specific SQL. The parent gate
// still authenticates API callers; this guard grants no additional access.
import { schemaCompatibility } from '../_schema-version.js';
export async function onRequest({env, next}) {
  return await schemaCompatibility(env.DB) || next();
}
