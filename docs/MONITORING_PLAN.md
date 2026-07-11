# Plan: Push-Based Prometheus Monitoring Bridge for Render Free Tier

## Context

The Wurud application runs on Render's Free Tier (512MB RAM limit) and needs to track OOM crashes. Render's free tier blocks inbound connections, so traditional Prometheus scraping won't work. The solution is to **push** metrics outbound to Grafana Cloud every 15 seconds using `prom-client` and the Remote Write protocol.

---

## Implementation Overview

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `prom-client` dependency |
| `utils/metrics.js` | Create | Metrics collection and push logic |
| `server.js` | Modify | Import and initialize metrics module |
| `.env.example` | Modify | Add Grafana Cloud env vars template |

---

## Step 1: Add prom-client Dependency

**File:** `/home/user/wurud/package.json`

Add to dependencies (after line 60):
```json
"prom-client": "^15.1.0",
```

---

## Step 2: Create Metrics Module

**File:** `/home/user/wurud/utils/metrics.js` (new file)

Structure:
1. Read env vars: `GRAFANA_URL`, `GRAFANA_USER_ID`, `GRAFANA_API_TOKEN`
2. Initialize prom-client with `wurud_` prefix (call `collectDefaultMetrics` only once)
3. Collect default Node.js metrics (RSS, Heap, CPU, Event Loop Lag)
4. Create background worker that pushes every 15 seconds
5. Use native `https` module with `async/await` (register.metrics() returns Promise)
6. Wrap in try/catch, run only when `NODE_ENV === 'production'`
7. Use `timer.unref()` to prevent blocking process exit

**Memory Optimization:**
- Call `collectDefaultMetrics()` only once at initialization
- Use `https.request.write()` with small chunks, avoid large string buffers
- Push and discard immediately to minimize memory lingering

**Endpoint Format:**
- Try Prometheus text format first (`register.metrics()` output)
- If needed, add formatter for Influx line protocol: `measurement,tag=value field=value timestamp`

Key patterns to follow (from existing codebase):
- `setInterval` pattern from `middleware/dbHealth.js:193-201`
- `isProduction` check from `server.js:24`
- Silent try/catch with production-only logging

**Example push logic:**
```javascript
const pushMetrics = async () => {
  try {
    const data = await client.register.metrics();
    const req = https.request(options, (res) => { /* handle res */ });
    req.write(data);
    req.end();
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') console.error(err);
  }
};
```

---

## Step 3: Integrate in server.js

**File:** `/home/user/wurud/server.js`

1. Add import after line 20:
```javascript
const { initMetrics } = require('./utils/metrics');
```

2. Add initialization after line 57 (after `setupDbHealthListeners()`):
```javascript
// Initialize Prometheus metrics push (production only)
initMetrics();
```

---

## Step 4: Update Environment Variables

**File:** `/home/user/wurud/.env.example`

Add at end of file:
```
# Grafana Cloud Prometheus Monitoring (optional)
# Push metrics to Grafana Cloud for OOM tracking
GRAFANA_URL=https://prometheus-xxx.grafana.net/api/prom/push
GRAFANA_USER_ID=123456
GRAFANA_API_TOKEN=glc_your_api_key_here
```

---

## PromQL Queries for Grafana Dashboard

### RSS Memory (MB) with 512MB Limit Line
```promql
# Query A - Actual memory usage
wurud_process_resident_memory_bytes{job="wurud"} / 1024 / 1024

# Query B - Threshold (set to red dashed line in Grafana)
vector(512)
```

### CPU Usage (%)
```promql
(
  rate(wurud_process_cpu_user_seconds_total{job="wurud"}[1m]) +
  rate(wurud_process_cpu_system_seconds_total{job="wurud"}[1m])
) * 100
```

### Heap Usage (%)
```promql
wurud_nodejs_heap_size_used_bytes{job="wurud"} / wurud_nodejs_heap_size_total_bytes{job="wurud"} * 100
```

### Event Loop Lag (ms)
```promql
wurud_nodejs_eventloop_lag_seconds{job="wurud"} * 1000
```

---

## Technical Decisions

1. **Use Influx Line Protocol endpoint** (`/api/v1/push/influx/write`) instead of Protobuf Remote Write - avoids adding `protobufjs` and `snappy` dependencies
2. **Native `https` module** - consistent with existing codebase (no axios/fetch)
3. **15-second push interval** - balances freshness with network/CPU overhead
4. **`timer.unref()`** - prevents metrics timer from blocking graceful shutdown
5. **Silent failure** - metrics are non-critical; errors logged only in development

---

## Verification

1. **Local test**: Set `NODE_ENV=development` - metrics will NOT push (safe)
2. **Production test**: Deploy with valid Grafana credentials
3. **Verify in Grafana**: Open Explore, query `wurud_process_resident_memory_bytes` - should show data within 30 seconds
4. **Check logs**: In production, should see `Metrics: Push worker started (15s interval)` on startup
5. **Run tests**: `npm test` should pass (metrics module won't affect tests due to production check)

---

## Render Sleep Behavior

When Render Free Tier puts the app to sleep (after 15 mins of inactivity), the `setInterval` stops and Grafana will show "No Data" gaps. This is expected behavior.

**Alerting Tip:** Set Grafana alerts to "Ignore No Data" to avoid false "Down" alerts during natural sleep periods.
