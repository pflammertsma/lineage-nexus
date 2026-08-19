#!/usr/bin/env node
/**
 * Grants or revokes the `admin` custom claim on a Firebase account.
 *
 *   node scripts/set-admin-claim.mjs you@example.com          # grant
 *   node scripts/set-admin-claim.mjs you@example.com --revoke # revoke
 *
 * A custom claim rides inside the signed ID token, so the archival API can check
 * it cryptographically without a database lookup, and the frontend can read the
 * same fact to decide whether to show the dashboard. One source of truth.
 *
 * Requires application default credentials with access to the Firebase project:
 *
 *   gcloud auth application-default login
 *   npm i firebase-admin      # not a project dependency; admin-only tooling
 *
 * The claim is applied to the account's *next* token. Firebase refreshes hourly,
 * so sign out and back in to see it immediately.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function projectId() {
  if (process.env.LINEAGE_GCP_PROJECT) return process.env.LINEAGE_GCP_PROJECT;
  const file = join(ROOT, '.deploy.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const [k, ...rest] = line.split('=');
      if (k?.trim() === 'LINEAGE_GCP_PROJECT') return rest.join('=').trim();
    }
  }
  return '';
}

const email = process.argv[2];
const revoke = process.argv.includes('--revoke');

if (!email || email.startsWith('--')) {
  console.error('Usage: node scripts/set-admin-claim.mjs <email> [--revoke]');
  process.exit(1);
}

const project = projectId();
if (!project) {
  console.error('No project configured. Set LINEAGE_GCP_PROJECT or fill in .deploy.env.');
  process.exit(1);
}

let admin;
try {
  admin = await import('firebase-admin');
} catch {
  console.error('firebase-admin is not installed. Run:  npm i firebase-admin');
  process.exit(1);
}

const app = admin.default.initializeApp({
  projectId: project,
  credential: admin.default.credential.applicationDefault(),
});

try {
  const user = await admin.default.auth(app).getUserByEmail(email);
  const existing = user.customClaims || {};

  // Merge rather than overwrite: blowing away other claims while granting admin
  // is an easy way to silently break something else that depends on them.
  const claims = { ...existing };
  if (revoke) delete claims.admin;
  else claims.admin = true;

  await admin.default.auth(app).setCustomUserClaims(user.uid, claims);

  console.log(`${revoke ? 'Revoked' : 'Granted'} admin for ${email} (${user.uid}) on ${project}.`);
  console.log('Claims are now:', JSON.stringify(claims));
  console.log('\nThe account must sign out and back in, or wait up to an hour, for its');
  console.log('token to carry the change.');
} catch (e) {
  console.error(`Failed: ${e.message}`);
  process.exit(1);
}
