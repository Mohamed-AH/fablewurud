/**
 * Startup environment validation (code-audit finding M9).
 *
 * Fails fast in production when a REQUIRED variable is missing, and warns (once,
 * at boot) for each optional integration that will silently disable itself.
 * This surfaces misconfiguration at deploy time instead of at first request.
 */

const isProduction = process.env.NODE_ENV === 'production';

function has(...vars) {
  return vars.every(v => Boolean(process.env[v]));
}

function validateEnv() {
  const errors = [];
  const warnings = [];

  // Required to run at all in production
  if (isProduction) {
    if (!process.env.MONGODB_URI) errors.push('MONGODB_URI (database connection)');
    if (!process.env.SESSION_SECRET) errors.push('SESSION_SECRET (session encryption)');
  }

  // Optional integrations — each disables itself if unconfigured
  if (!process.env.SENTRY_DSN) warnings.push('SENTRY_DSN — error tracking disabled');
  if (!has('GRAFANA_URL', 'GRAFANA_USER_ID', 'GRAFANA_API_TOKEN')) {
    warnings.push('GRAFANA_URL/GRAFANA_USER_ID/GRAFANA_API_TOKEN — metrics push disabled');
  }
  if (!(has('OCI_PRIVATE_KEY', 'OCI_TENANCY') || process.env.OCI_CONFIG_FILE)) {
    warnings.push('OCI_* — object storage disabled (audio upload/download will fail)');
  }
  if (!has('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME')) {
    warnings.push('R2_* — Cloudflare R2 storage backend disabled');
  }
  if (!has('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL')) {
    warnings.push('GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL — admin login disabled');
  }
  if (!has('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID')) {
    warnings.push('TELEGRAM_BOT_TOKEN/CHAT_ID — contact form disabled');
  }

  warnings.forEach(w => console.warn(`⚠️ [env] ${w}`));

  if (errors.length) {
    console.error('FATAL: missing required environment variable(s):');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}

module.exports = { validateEnv };
