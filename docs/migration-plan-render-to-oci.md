# Migration Plan: Render Free Tier → Oracle Cloud (OCI) Free Tier

## Executive Summary

| Aspect | Render Free Tier | OCI Always Free |
|--------|------------------|-----------------|
| **RAM** | 512 MB | Up to 24 GB (ARM) |
| **CPU** | Shared | 4 OCPUs (ARM) |
| **Storage** | 0 (ephemeral) | 200 GB block storage |
| **Bandwidth** | Limited | 10 TB/month outbound |
| **Cost** | Free | Free (Always Free) |

Your OOM kills stem from the 512MB limit. OCI's ARM instance with 24GB RAM eliminates this bottleneck entirely.

---

## Phase 1: OCI Compute Instance Setup

### 1.1 Create the ARM Compute Instance

**Recommended Configuration:**
- **Shape:** VM.Standard.A1.Flex (ARM Ampere)
- **OCPUs:** 1-2 (start conservative, can scale to 4)
- **Memory:** 6-12 GB (start with 6GB, scale if needed)
- **Image:** Ubuntu 22.04 (aarch64)
- **Boot Volume:** 50 GB (within 200GB free limit)

> **Note:** ARM instances may face capacity constraints. If you get "Out of capacity" errors, try different availability domains or upgrade to Pay-As-You-Go (PAYG) — you won't be charged for Always Free resources. ([Source](https://medium.com/@me69oshan/get-always-free-vm-instance-in-oracle-cloud-and-solve-out-of-host-capacity-issue-the-easy-way-88babae4eae5))

> **ARM Compatibility Warning:** While ARM instances offer excellent cost savings, some npm packages may not have ARM (aarch64) support yet. Test your dependencies locally or in CI before deploying. If you encounter compatibility issues, consider using the x86 VM.Standard.E2.1.Micro shape (1 OCPU, 1GB RAM) as a fallback, though it has less resources.

### 1.2 VCN and Networking Setup

Before creating the instance, set up the networking infrastructure.

#### Step 1: Create a VCN (Virtual Cloud Network)

1. **Navigate:** Networking → Virtual Cloud Networks → Create VCN
2. **Configuration:**
   - **Name:** `wurud-vcn` (or your preference)
   - **CIDR Block:** `10.0.0.0/16`
   - **DNS Label:** `wurudvcn`
   - Check **Use DNS Hostnames in this VCN**

#### Step 2: Create Subnets

**Public Subnet** (for your instance):
- **Name:** `public-subnet`
- **CIDR Block:** `10.0.0.0/24`
- **Subnet Access:** Public (Regional)
- **DNS Label:** `public`

**Private Subnet** (optional, for future use):
- **Name:** `private-subnet`
- **CIDR Block:** `10.0.1.0/24`
- **Subnet Access:** Private

#### Step 3: Create Internet Gateway

1. **Navigate:** VCN → Internet Gateways → Create
2. **Name:** `wurud-igw`

#### Step 4: Update Route Table

1. **Navigate:** VCN → Route Tables → Default Route Table
2. **Add Route Rule:**
   - **Target Type:** Internet Gateway
   - **Destination CIDR:** `0.0.0.0/0`
   - **Target:** Select your `wurud-igw`

#### Step 5: Configure Security List (Ingress Rules)

Navigate: VCN → Security Lists → Default Security List

Add these **Ingress Rules**:

| Source CIDR | Protocol | Port | Description |
|-------------|----------|------|-------------|
| `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | TCP | 80 | HTTP |
| `0.0.0.0/0` | TCP | 443 | HTTPS |
| `0.0.0.0/0` | TCP | 3000 | Node.js (temp) |
| `0.0.0.0/0` | ICMP | All | Ping |

#### Step 6: Enable IPv6 (Optional)

1. **Edit VCN:** Add IPv6 CIDR block
2. **Edit Subnet:** Assign IPv6 CIDR from the VCN's IPv6 block
3. **Update Route Table:** Add IPv6 route `::/0` → Internet Gateway
4. **Update Security List:** Add IPv6 ingress rules (`::/0` for source)

#### Step 7: VNIC Configuration (During Instance Creation)

When creating your compute instance, configure the primary VNIC:

1. **Primary VNIC:**
   - **VCN:** Select `wurud-vcn`
   - **Subnet:** Select `public-subnet`
   - **Public IPv4:** ✅ Assign a public IPv4 address
   - **Private IPv4:** Auto-assigned (e.g., `10.0.0.x`)
   - **IPv6:** ✅ Assign IPv6 address (if enabled on subnet)

**Network Architecture:**

```
┌─────────────────────────────────────────────────┐
│  VCN: wurud-vcn (10.0.0.0/16)                   │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Public Subnet (10.0.0.0/24)            │    │
│  │                                         │    │
│  │  ┌─────────────────────────────────┐   │    │
│  │  │  Your Instance (1 OCPU, 6GB)    │   │    │
│  │  │  VNIC:                          │   │    │
│  │  │  - Private IP: 10.0.0.x         │   │    │
│  │  │  - Public IP: xxx.xxx.xxx.xxx   │   │    │
│  │  │  - IPv6: (if enabled)           │   │    │
│  │  └─────────────────────────────────┘   │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                     │                           │
│              Internet Gateway                   │
│                     │                           │
└─────────────────────┼───────────────────────────┘
                      ▼
                  Internet
```

### 1.3 Initial Instance Setup (Ubuntu)

```bash
# SSH into your instance (Ubuntu uses 'ubuntu' user, not 'opc')
ssh -i ~/.ssh/your-key ubuntu@<public-ip>

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Add user to docker group
sudo usermod -aG docker ubuntu
newgrp docker
```

### 1.4 Configure Firewall & Security Lists

```bash
# Ubuntu uses ufw (Uncomplicated Firewall)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Node.js (temp)
sudo ufw enable
sudo ufw status
```

**In OCI Console:**
1. Navigate: Networking → Virtual Cloud Networks → Your VCN → Security Lists
2. Add Ingress Rules:
   - TCP 80 from 0.0.0.0/0 (HTTP)
   - TCP 443 from 0.0.0.0/0 (HTTPS)
   - TCP 3000 from 0.0.0.0/0 (Node.js, temporary)

---

## Phase 2: Application Deployment

### 2.1 Modify Dockerfile for ARM

Your existing Dockerfile should work, but verify ARM compatibility:

```dockerfile
# Already correct - node:20-alpine supports ARM64
FROM node:20-alpine

# Rest of your Dockerfile remains the same
```

### 2.2 Create Production docker-compose.yml

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  duroos:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: duroos-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    volumes:
      - ./uploads:/app/uploads
      # Note: Don't mount logs volume - use Docker logging + Sentry instead
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    # No memory limits needed - you have 12GB+!
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - duroos

volumes:
  caddy_data:
  caddy_config:
```

### 2.3 Create Caddyfile (Automatic HTTPS)

```
yourdomain.com {
    reverse_proxy duroos:3000

    encode gzip

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    log {
        output file /data/access.log {
            roll_size 50mb
            roll_keep 5
        }
    }
}
```

### 2.4 Why NOT to Use PM2 with Docker

> **Important:** Do NOT use PM2 inside Docker containers.

Docker containers are designed to run **one main process**:
- With PM2 → you're introducing a process manager inside another process manager
- With Docker → container lifecycle = your app lifecycle

**The Dockerfile already uses the correct approach:**
```dockerfile
CMD ["node", "server.js"]
```

Docker handles:
- Process supervision (via `restart: unless-stopped`)
- Health checks (via `HEALTHCHECK`)
- Log management (via logging driver)
- Resource limits (via Docker/compose configuration)

If you need horizontal scaling, use Docker Swarm or Kubernetes to run multiple containers, not PM2 cluster mode inside a container.

---

## Phase 3: Logging, Tracing & Monitoring

### Recommended Stack (Low Overhead)

Given your preference for practical tools over enterprise stacks, here's a lightweight approach:

| Component | Tool | Memory Usage | Why |
|-----------|------|--------------|-----|
| **Logs** | Docker JSON + Logrotate | ~0 | Built-in, zero overhead |
| **Errors** | Sentry (Free Plan) | 0 (external) | Error tracking, no infra |
| **Metrics** | VictoriaMetrics | ~30-50 MB | Prometheus-compatible, lighter |
| **Dashboards** | Grafana Cloud (Free) | 0 (external) | Don't self-host, use free tier |
| **Alerts** | VictoriaMetrics vmalert | ~20 MB | Built-in alerting |
| **Uptime** | Better Stack (Free) | 0 (external) | External monitoring |

> **Important:** Don't self-host Grafana. Use [Grafana Cloud Free Tier](https://grafana.com/pricing/) instead:
> - 10K metrics, 50GB logs, 50GB traces free
> - No infrastructure to maintain
> - Remote write from VictoriaMetrics to Grafana Cloud

### 3.1 Option A: Minimal (Recommended for Simplicity)

**Just use Docker's built-in logging + external uptime monitoring:**

```yaml
# In docker-compose.prod.yml - already configured
logging:
  driver: "json-file"
  options:
    max-size: "50m"
    max-file: "5"
```

**Add Better Stack or UptimeRobot (Free tier):**
- Monitor `/health` endpoint
- Get alerts on downtime
- Basic response time tracking

**View logs:**
```bash
# Tail logs
docker logs -f duroos-app

# Search logs
docker logs duroos-app 2>&1 | grep "error"
```

### 3.2 Option B: VictoriaMetrics + Grafana Cloud (If You Want Metrics)

Use VictoriaMetrics locally to collect metrics, then remote-write to Grafana Cloud for dashboards.

**Add vmagent to `docker-compose.prod.yml`:**

```yaml
  vmagent:
    image: victoriametrics/vmagent:latest
    container_name: vmagent
    restart: unless-stopped
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - "-promscrape.config=/etc/prometheus/prometheus.yml"
      - "-remoteWrite.url=${GRAFANA_REMOTE_WRITE_URL}"
      - "-remoteWrite.basicAuth.username=${GRAFANA_METRICS_USER}"
      - "-remoteWrite.basicAuth.password=${GRAFANA_API_KEY}"
    # Uses ~30-50MB RAM
```

**Create `prometheus.yml`:**
```yaml
scrape_configs:
  - job_name: 'duroos'
    static_configs:
      - targets: ['duroos:3000']
    scrape_interval: 30s
```

**Get Grafana Cloud credentials:**
1. Sign up at https://grafana.com/products/cloud/
2. Go to Connections → Add new connection → Hosted Prometheus
3. Copy the Remote Write URL, Username, and generate an API key

**Add metrics to your Node.js app:**

```bash
npm install prom-client
```

Create `utils/metrics.js`:

```javascript
const client = require('prom-client');

// Collect default metrics (memory, CPU, etc.)
client.collectDefaultMetrics({ prefix: 'duroos_' });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'duroos_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 1, 3, 5, 10]
});

const activeStreams = new client.Gauge({
  name: 'duroos_active_streams',
  help: 'Number of active audio streams'
});

module.exports = { client, httpRequestDuration, activeStreams };
```

Add metrics endpoint to `server.js`:

```javascript
const { client } = require('./utils/metrics');

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

### 3.3 Error Tracking with Sentry (Recommended)

> **Important:** Don't log to file inside containers. Use Sentry's free plan for error tracking and monitoring.

**Install Sentry:**
```bash
npm install @sentry/node
```

**Initialize in `server.js`:**
```javascript
const Sentry = require('@sentry/node');

// Initialize Sentry BEFORE other imports
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
});

// Add error handler middleware (AFTER all routes)
app.use(Sentry.Handlers.errorHandler());
```

**Benefits of Sentry Free Plan:**
- 5K errors/month free
- Error grouping and deduplication
- Stack traces with source maps
- Performance monitoring
- Slack/email alerts
- No infrastructure to maintain

**Environment variable:**
```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

For general logging, continue using Docker's built-in JSON logging (already configured in docker-compose) and view with `docker logs`.

---

## Phase 4: Deployment Script

Create `deploy.sh` on your OCI instance:

```bash
#!/bin/bash
set -e

APP_DIR="/home/ubuntu/duroos"
REPO_URL="https://github.com/yourusername/wurud.git"

echo "=== Deploying Duroos ==="

# Pull latest code
cd $APP_DIR
git pull origin main

# Build and restart
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Cleanup old images
docker image prune -f

# Show status
docker compose -f docker-compose.prod.yml ps

echo "=== Deployment complete ==="
```

---

## Phase 5: DNS & SSL

### 5.1 Point Domain to OCI

1. Get your OCI instance's public IP
2. Update DNS A record: `yourdomain.com → <OCI-IP>`
3. Wait for propagation (5-30 minutes)

### 5.2 Update Environment Variables

```bash
# .env.production
SITE_URL=https://yourdomain.com
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback
```

### 5.3 Update Google OAuth

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Edit your OAuth client
3. Add authorized redirect URI: `https://yourdomain.com/auth/google/callback`

---

## Complexity Assessment

| Task | Complexity | Time Estimate | Notes |
|------|------------|---------------|-------|
| OCI Instance Setup | Low | 30 min | Straightforward UI |
| Docker Installation | Low | 15 min | Standard commands |
| Security/Firewall | Medium | 20 min | Two layers (OS + OCI) |
| App Deployment | Low | 30 min | Your Docker setup is ready |
| SSL/Domain | Low | 15 min | Caddy handles automatically |
| Monitoring (Basic) | Low | 10 min | External uptime only |
| Monitoring (Full) | Medium | 1-2 hours | VictoriaMetrics + Grafana |
| **Total (Basic)** | **Low** | **~2 hours** | Minimal monitoring |
| **Total (Full)** | **Medium** | **~4 hours** | With metrics stack |

### Operational Complexity Comparison

| Aspect | Render | OCI |
|--------|--------|-----|
| Deployment | Git push (automatic) | SSH + docker compose |
| SSL | Automatic | Automatic (Caddy) |
| Scaling | Limited | Manual (but room to grow) |
| Maintenance | Zero | Security updates (~monthly) |
| Logs | Dashboard | SSH + docker logs |
| Cost Risk | None | None (Always Free) |

---

## Migration Checklist

```
□ Phase 1: OCI Setup
  □ Create ARM compute instance
  □ Install Docker
  □ Configure firewall (OS + OCI Security Lists)
  □ Clone repository

□ Phase 2: Application
  □ Create .env.production with all variables
  □ Create Caddyfile
  □ Create docker-compose.prod.yml
  □ Build and test locally on OCI

□ Phase 3: Monitoring
  □ Set up external uptime monitor (Better Stack/UptimeRobot)
  □ (Optional) Add VictoriaMetrics
  □ Configure log rotation

□ Phase 4: Go Live
  □ Update DNS to point to OCI IP
  □ Update Google OAuth redirect URIs
  □ Test all functionality:
    □ Homepage loads
    □ Admin login works
    □ Audio streaming works
    □ File upload works
  □ Monitor for 24-48 hours

□ Phase 5: Cleanup
  □ Keep Render as backup for 1 week
  □ Delete Render service after stable
```

---

## Key Benefits After Migration

1. **No more OOM kills** - 24x more RAM available
2. **Faster performance** - Can run multiple Node.js instances
3. **Room to grow** - Cache more, enable more features
4. **Better streaming** - More memory for concurrent streams
5. **Lower latency** - OCI has a Jeddah region (me-jeddah-1) close to your users
6. **Already using OCI** - Unified infrastructure with your Object Storage

---

## Sources

- [OCI Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [OCI Free Tier Overview](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)
- [Docker on OCI Free Tier Setup](https://oneuptime.com/blog/post/2026-02-08-how-to-set-up-docker-on-an-oracle-cloud-free-tier-instance/view)
- [OCI Free Tier with Docker and Traefik](https://angelosantarella.gitlab.io/work/oracle-cloud-free-instances/)
- [Prometheus Alternatives](https://simpleobservability.com/blog/prometheus-alternatives)
- [Node.js Monitoring Tools 2026](https://betterstack.com/community/comparisons/nodejs-application-monitoring-tools/)
- [Grafana Alternatives](https://openobserve.ai/blog/top-10-grafana-alternatives/)
