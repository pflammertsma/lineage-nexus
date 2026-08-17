import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const FIREBASE_REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
]

/**
 * Both of the app's config fallbacks are safe in development and dangerous in
 * production, and neither announces itself at runtime:
 *
 *   - Missing VITE_FIREBASE_*  -> isFirebaseConfigured is false -> useAuth falls
 *     back to the *simulated* login, so "Sign in with Google" merely sets a
 *     localStorage flag and shows the visitor as "Researcher". Published, that
 *     is worse than having no sign-in at all.
 *   - Missing VITE_API_BASE_URL -> the bundle calls http://localhost:8081, i.e.
 *     the visitor's own machine, which is also blocked as mixed content.
 *
 * So a production build fails loudly instead of quietly emitting either. Set
 * VITE_ALLOW_INCOMPLETE_CONFIG=true to build a local-only bundle on purpose.
 */
function checkProductionConfig(env) {
  const problems = []

  if (!env.VITE_API_BASE_URL) {
    problems.push('VITE_API_BASE_URL is not set — the bundle would call http://localhost:8081.')
  } else if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(env.VITE_API_BASE_URL)) {
    problems.push(`VITE_API_BASE_URL points at localhost (${env.VITE_API_BASE_URL}).`)
  } else if (env.VITE_API_BASE_URL.startsWith('http://')) {
    problems.push(`VITE_API_BASE_URL is not HTTPS (${env.VITE_API_BASE_URL}) — the browser will block it as mixed content.`)
  }

  const missing = FIREBASE_REQUIRED.filter((key) => !env[key])
  if (missing.length) {
    problems.push(
      `Firebase is not configured (missing ${missing.join(', ')}), so sign-in would fall back to the simulated local login.`
    )
  }

  if (problems.length) {
    throw new Error(
      '\n\nProduction build blocked — configuration is incomplete:\n\n' +
      problems.map((p) => `  • ${p}`).join('\n') +
      '\n\nFill in apps/web-frontend/.env (see .env.example).' +
      '\nTo build a deliberately local-only bundle: VITE_ALLOW_INCOMPLETE_CONFIG=true\n'
    )
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  if (command === 'build' && mode === 'production' && env.VITE_ALLOW_INCOMPLETE_CONFIG !== 'true') {
    checkProductionConfig(env)
  }

  return {
    plugins: [react()],
  }
})
