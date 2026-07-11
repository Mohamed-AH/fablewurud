/**
 * PM2 Ecosystem Configuration
 *
 * This file configures PM2 process manager for production deployment
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production
 */

module.exports = {
  apps: [{
    name: 'duroos',
    script: './server.js',

    // Process management
    instances: 1, // Use 'max' for cluster mode (one instance per CPU)
    exec_mode: 'fork', // Use 'cluster' for multiple instances

    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },

    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Restart behavior
    autorestart: true,
    watch: false, // Don't watch in production
    max_memory_restart: '380M', // Lower for Render Free Tier (512MB total, leave headroom for GC)

    // Restart on these signals
    kill_timeout: 5000,
    wait_ready: false,

    // Advanced features
    min_uptime: '10s', // Min uptime before considering app as stable
    max_restarts: 10, // Max number of restarts within 1 minute before stopping
    restart_delay: 4000,

    // Monitoring (optional)
    // instance_var: 'INSTANCE_ID',
    // pmx: true,

    // Environment specific settings
    // Optimized for Render Free Tier (512MB limit)
    // Lower heap allows GC headroom before Render kills the process
    node_args: '--max-old-space-size=400',
  }],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'duroos',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/wurud.git',
      path: '/home/duroos/wurud',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-deploy-local': '',
      'post-setup': 'npm install --production'
    }
  }
};
