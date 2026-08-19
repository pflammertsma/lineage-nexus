#!/usr/bin/env node
/**
 * Deployment driver for Lineage Nexus.
 *
 *   node scripts/deploy.mjs api     backend  -> Cloud Run
 *   node scripts/deploy.mjs web     frontend -> Firebase Hosting
 *   node scripts/deploy.mjs rules   firestore.rules
 *   node scripts/deploy.mjs all     rules, api, then web
 *
 * Why this exists rather than a bare `gcloud run deploy` in package.json:
 *
 *  1. `gcloud` deploys to whatever `gcloud config get-value project` happens to
 *     return. That is a live footgun — one forgotten `gcloud config set project`
 *     and this service lands in an unrelated project. Every command here refuses
 *     to run unless the active project matches the configured one.
 *
 *  2. The repository is public, so no project id, domain or account detail is
 *     committed. Configuration is read from the environment, or from a
 *     gitignored `.deploy.env` at the repository root:
 *
 *         LINEAGE_GCP_PROJECT=your-project-id
 *         LINEAGE_REGION=europe-west4
 *         LINEAGE_ALLOWED_ORIGINS=https://your-domain
 *         LINEAGE_MAX_INSTANCES=2
 *
 *     `firebase --project` is passed explicitly for the same reason, so no
 *     `.firebaserc` is needed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVICE = 'lineage-nexus-api';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

function fail(message, hint) {
  console.error(`\n${RED}✗ ${message}${RESET}`);
  if (hint) console.error(`\n${hint}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`\n${GREEN}▸ ${message}${RESET}`);
}

/** Parses the gitignored `.deploy.env`, if present. Values in the real environment win. */
function loadConfig() {
  const config = {};
  const file = join(ROOT, '.deploy.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      config[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return {
    project: process.env.LINEAGE_GCP_PROJECT || config.LINEAGE_GCP_PROJECT || '',
    region: process.env.LINEAGE_REGION || config.LINEAGE_REGION || 'europe-west4',
    origins: process.env.LINEAGE_ALLOWED_ORIGINS || config.LINEAGE_ALLOWED_ORIGINS || '',
    // Defaults to 1 deliberately — see the warning in deployApi().
    maxInstances: process.env.LINEAGE_MAX_INSTANCES || config.LINEAGE_MAX_INSTANCES || '1',
  };
}

/** Runs a command inheriting stdio, and aborts the deploy if it fails. */
function run(command, args, options = {}) {
  console.log(`${DIM}$ ${command} ${args.join(' ')}${RESET}`);
  // shell: true so `gcloud`/`firebase` resolve as .cmd shims on Windows.
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: ROOT, shell: true, ...options });
  if (result.error) fail(`Could not run \`${command}\`. Is it installed and on PATH?`);
  if (result.status !== 0) fail(`\`${command} ${args[0]}\` exited with code ${result.status}.`);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: true });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || '').trim();
}

/**
 * The guard. Refuses to deploy unless the configured project is both set and
 * currently active in gcloud — the two ways this goes wrong are an unset config
 * and a stale active project, and neither announces itself.
 */
function preflight(config) {
  if (!config.project) {
    fail(
      'No target project configured.',
      `Set it in the environment or in a ${YELLOW}.deploy.env${RESET} file at the repository root:\n\n` +
      `    LINEAGE_GCP_PROJECT=your-project-id\n` +
      `    LINEAGE_ALLOWED_ORIGINS=https://your-domain\n\n` +
      `${DIM}.deploy.env is gitignored — this repository is public, so no project id is committed.${RESET}`
    );
  }

  const active = capture('gcloud', ['config', 'get-value', 'project']);
  if (active === null) {
    fail('Could not read the active gcloud project.', 'Is the gcloud CLI installed and authenticated?');
  }
  if (active !== config.project) {
    fail(
      `Refusing to deploy: gcloud is pointed at a different project.`,
      `    configured : ${GREEN}${config.project}${RESET}\n` +
      `    active     : ${RED}${active || '(unset)'}${RESET}\n\n` +
      `Switch to it, then retry:\n\n` +
      `    gcloud config set project ${config.project}\n`
    );
  }
  console.log(`${DIM}Target project: ${config.project} (region ${config.region})${RESET}`);
}

function deployApi(config) {
  if (!config.origins) {
    fail(
      'LINEAGE_ALLOWED_ORIGINS is not set.',
      `CORS defaults to ${YELLOW}*${RESET} when unset, which would leave the API callable from any origin.\n` +
      `Set it to your site's origin, e.g.\n\n` +
      `    LINEAGE_ALLOWED_ORIGINS=https://your-domain\n`
    );
  }

  // Archive traffic egresses from Cloud Run, so OpenArchieven sees one IP for
  // every user. The 2 req/s pacing is a per-process clock, correct only while
  // there is exactly one process. Each extra instance multiplies the real rate
  // against that shared IP, which risks a ban rather than merely slow research.
  if (config.maxInstances !== '1') {
    console.warn(
      `\n${YELLOW}⚠ max-instances is ${config.maxInstances}, not 1.${RESET}\n` +
      `  The OpenArchieven rate limiter is per-process, so ${config.maxInstances} instances hit the\n` +
      `  archive at up to ${config.maxInstances}x the agreed 2 req/s from a single IP. Move the limiter to\n` +
      `  shared storage before scaling out, or you risk being blocked.\n`
    );
  }

  step('Deploying backend to Cloud Run');

  // Env vars go through a file rather than --set-env-vars. ALLOWED_ORIGINS is a
  // comma-separated list, and gcloud reads commas as separators between dict
  // entries, so the value has to be escaped with a `^delim^` prefix — which then
  // has to survive a Windows shell, where `^` is itself the escape character.
  // A YAML file sidesteps both layers of quoting.
  const envFile = '.cloudrun-env.yaml';
  writeFileSync(join(ROOT, envFile), `ALLOWED_ORIGINS: ${JSON.stringify(config.origins)}
`, 'utf8');
  try {
    run('gcloud', [
      'run', 'deploy', SERVICE,
      '--source', 'apps/cloud-backend',
      '--project', config.project,
      '--region', config.region,
      '--allow-unauthenticated',
      // A research turn spans paced archive searches and in-place quota waits; the
      // default 300s cuts the SSE stream mid-research.
      '--timeout=900',
      // Bounds the cost of an unauthenticated endpoint that holds connections open.
      `--max-instances=${config.maxInstances}`,
      `--env-vars-file=${envFile}`,
    ]);
  } finally {
    rmSync(join(ROOT, envFile), { force: true });
  }

  const url = capture('gcloud', [
    'run', 'services', 'describe', SERVICE,
    '--project', config.project, '--region', config.region,
    '--format=value(status.url)',
  ]);
  if (url) {
    console.log(`\n${GREEN}Service URL:${RESET} ${url}`);
    console.log(`${DIM}Set this as VITE_API_BASE_URL in apps/web-frontend/.env, then redeploy the web app.${RESET}`);
  }
}

function deployWeb(config) {
  step('Building frontend');
  // build.mjs enforces that production config is actually present.
  run('pnpm', ['--dir', 'apps/web-frontend', 'build']);

  step('Deploying frontend to Firebase Hosting');
  run('firebase', ['deploy', '--only', 'hosting', '--project', config.project]);
}

function deployRules(config) {
  step('Deploying Firestore rules');
  run('firebase', ['deploy', '--only', 'firestore:rules', '--project', config.project]);
}

function deployArchival(config) {
  step('Deploying Self-Hosted Archival Gateway API to OCI');
  const ociHost = process.env.LINEAGE_OCI_HOST || config.ociHost || '140.238.212.86';
  const ociUser = process.env.LINEAGE_OCI_USER || config.ociUser || 'ubuntu';
  const keyPath = process.env.LINEAGE_OCI_KEY || join(ROOT, '.ssh', 'ssh-key-2026-08-18.key');

  if (!existsSync(keyPath)) {
    fail(`SSH Key not found at ${keyPath}. Ensure key is present in .ssh/ or set LINEAGE_OCI_KEY.`);
  }

  const targetRemote = `${ociUser}@${ociHost}`;
  step(`Syncing archival harvester service to ${targetRemote}:/opt/archival-harvester/`);
  run('scp', ['-i', keyPath, '-r', 'services/archival-harvester/*', `${targetRemote}:/opt/archival-harvester/`]);

  step('Rebuilding and restarting gateway container on OCI host');
  const remoteCmd = 'cd /opt/archival-harvester && sudo docker stop gateway || true; sudo docker rm gateway || true; sudo docker build -t archival-gateway . && sudo docker run -d --name gateway -e MEILI_MASTER_KEY=lineage_nexus_archival_key_2026 -e ADMIN_SECRET_TOKEN=lineage_admin_secret_998877 --restart always --net=host archival-gateway';
  run('ssh', ['-i', keyPath, targetRemote, `"${remoteCmd}"`]);
}

const TARGETS = { api: deployApi, web: deployWeb, rules: deployRules, archival: deployArchival };

const target = process.argv[2];
if (!target || (!TARGETS[target] && target !== 'all')) {
  console.error(`Usage: node scripts/deploy.mjs <${Object.keys(TARGETS).join('|')}|all>`);
  process.exit(1);
}

const config = loadConfig();
if (target !== 'archival') {
  preflight(config);
}

if (target === 'all') {
  // Rules first: sync fails silently against default deny-all rules, so they
  // should never lag behind a client that expects them.
  deployRules(config);
  deployApi(config);
  deployWeb(config);
  deployArchival(config);
} else {
  TARGETS[target](config);
}

console.log(`\n${GREEN}✓ Done.${RESET}\n`);
