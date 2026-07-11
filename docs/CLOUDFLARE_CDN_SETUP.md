# Cloudflare CDN Setup - Full Site Proxy

This guide explains how to configure Cloudflare as a Full Site Proxy CDN for rasmihassan.com.

## Overview

Cloudflare Full Site Proxy (orange cloud icon) routes all traffic through Cloudflare's edge network, providing:
- **Global CDN**: Caches static assets at 300+ edge locations worldwide
- **DDoS Protection**: Automatic protection against attacks
- **SSL/TLS**: Free SSL certificates with automatic renewal
- **Performance**: Automatic minification, compression, and optimization
- **Security**: WAF, bot management, and IP blocking

## Prerequisites

- Domain: rasmihassan.com
- Cloudflare account (Free tier is sufficient)
- DNS already configured on Cloudflare

## Setup Steps

### 1. Enable Full Site Proxy (Orange Cloud)

1. Log in to Cloudflare Dashboard
2. Select **rasmihassan.com** domain
3. Go to **DNS** > **Records**
4. For all A/AAAA/CNAME records pointing to your Render app:
   - Click the **gray cloud** icon to make it **orange**
   - This enables proxying through Cloudflare

**Example DNS Records:**
```
Type    Name    Content                         Proxy Status
A       @       <Render IP>                     Proxied (orange)
CNAME   www     rasmihassan.com                 Proxied (orange)
```

### 2. Configure SSL/TLS

1. Go to **SSL/TLS** > **Overview**
2. Set encryption mode to **Full (strict)**
   - Render provides valid SSL certificates
   - This ensures end-to-end encryption

3. Go to **SSL/TLS** > **Edge Certificates**
   - Enable **Always Use HTTPS**
   - Enable **Automatic HTTPS Rewrites**
   - Set **Minimum TLS Version** to TLS 1.2

### 3. Configure Caching

1. Go to **Caching** > **Configuration**
   - Set **Caching Level** to **Standard**
   - Set **Browser Cache TTL** to **Respect Existing Headers**
     (Our server already sets proper cache headers)

2. Go to **Caching** > **Cache Rules** (or Page Rules)
   - Create rules to cache static assets:

**Rule 1: Cache Static Assets (Free tier)**
```
If URL Path matches: /css/* OR /js/* OR /images/*
Then: Cache Level = Cache Everything
      Edge Cache TTL = 1 month
      Browser Cache TTL = 1 year
```

**Rule 2: Cache Homepage (Free tier)**
```
If URL Path equals: /
Then: Cache Level = Standard
      Edge Cache TTL = 5 minutes
```

### 4. Configure Performance

1. Go to **Speed** > **Optimization**
   - Enable **Auto Minify**: CSS, JavaScript, HTML
   - Enable **Brotli** compression
   - Enable **Early Hints** (preload assets)

2. Go to **Speed** > **Optimization** > **Protocol**
   - Enable **HTTP/2**
   - Enable **HTTP/3 (QUIC)** if available

### 5. Configure Security

1. Go to **Security** > **Settings**
   - Set **Security Level** to **Medium**
   - Enable **Browser Integrity Check**
   - Enable **Hotlink Protection** (optional)

2. Go to **Security** > **WAF**
   - Enable **Managed Rules** (free basic rules)

### 6. Verify Configuration

1. Test site loads correctly: https://rasmihassan.com
2. Check response headers:
   ```bash
   curl -I https://rasmihassan.com
   ```

   Look for:
   - `cf-cache-status: HIT` (for cached content)
   - `cf-ray: <ray-id>` (confirms Cloudflare proxy)
   - `server: cloudflare`

3. Test from different locations using:
   - https://www.webpagetest.org/
   - https://gtmetrix.com/

## Cache Purging

When you deploy new content or make changes:

1. **Automatic**: Cloudflare respects cache headers from origin
2. **Manual Purge**: Cloudflare Dashboard > Caching > Purge Everything
3. **API Purge** (for automation):
   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
     -H "Authorization: Bearer <API_TOKEN>" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'
   ```

## Cache Headers from Origin

Our server already sets these cache headers:

| Asset Type | Cache-Control |
|-----------|---------------|
| Static files (CSS/JS/images) | `public, max-age=31536000, immutable` |
| HTML pages | No cache (dynamic) |
| Sitemap | `public, max-age=3600` |
| API responses | No cache (dynamic) |

## Monitoring

1. **Analytics**: Cloudflare Dashboard > Analytics
   - View requests, bandwidth, cache hit ratio
   - Monitor threats and blocked requests

2. **Cache Hit Ratio**: Target 80%+ for static assets
   - Check: Analytics > Performance > Cache Hit Ratio

## Troubleshooting

### Site Not Loading
1. Check DNS propagation: `dig rasmihassan.com`
2. Verify Render is healthy: Check Render dashboard
3. Temporarily disable proxy (gray cloud) to test

### Cache Not Working
1. Check origin response headers
2. Ensure no `Cache-Control: no-store` headers
3. Check cache rules in Cloudflare dashboard

### SSL Errors
1. Verify SSL mode is "Full (strict)"
2. Check Render SSL certificate is valid
3. Clear browser cache and retry

## Free Tier Limits

Cloudflare Free tier includes:
- Unlimited bandwidth
- Unlimited DDoS protection
- 3 Page Rules (use Cache Rules instead)
- Basic WAF rules
- 100k Worker requests/day
- Free SSL certificate

No limits on:
- CDN caching
- Edge locations
- Requests per second

## Next Steps (Optional)

1. **Cloudflare Workers**: Edge computing for dynamic content
2. **Argo Smart Routing**: Faster routing (paid)
3. **Image Optimization**: Automatic WebP/AVIF conversion (paid)
4. **APO (Automatic Platform Optimization)**: For WordPress sites

---

*Last updated: 2026-02-17*
