# Deployment Guide for Duroos Platform

## Pre-Deployment Checklist

Before deploying to production, ensure:

- [ ] All testing completed (see `TESTING_CHECKLIST.md`)
- [ ] MongoDB production database created
- [ ] Google OAuth credentials for production domain obtained
- [ ] Domain name purchased and DNS configured
- [ ] SSL certificate ready (Let's Encrypt recommended)
- [ ] Environment variables prepared for production
- [ ] Admin email addresses finalized
- [ ] Audio file storage location decided

---

## Deployment Options

### Option 1: VPS (Virtual Private Server) - Recommended

**Best for**: Full control, cost-effective for long-term hosting

**Providers**:
- DigitalOcean ($4-6/month for basic droplet)
- Linode ($5/month)
- Vultr ($5/month)
- AWS EC2 (free tier available for 1 year)
- Hetzner ($4/month)

**Pros**:
- Full control over server
- Cost-effective for 24/7 hosting
- Can scale resources as needed
- One-time setup

**Cons**:
- Requires server management knowledge
- Need to handle security updates
- Initial setup time required

### Option 2: Platform as a Service (PaaS)

**Providers**:
- Render.com (Free tier available, $7/month for paid)
- Railway.app (Free tier available)
- Fly.io (Free tier available)
- Heroku ($7/month for Eco dyno)

**Pros**:
- Easier deployment (Git-based)
- Automatic SSL certificates
- Built-in monitoring
- Less server management

**Cons**:
- More expensive long-term
- Less control
- Cold starts on free tiers

### Option 3: Serverless/Cloud

**Providers**:
- Vercel (with Node.js backend)
- AWS Lambda + API Gateway
- Google Cloud Run

**Pros**:
- Auto-scaling
- Pay per use
- High availability

**Cons**:
- Complex setup for this app
- Audio streaming may not be ideal
- Potentially higher costs with traffic

---

## Recommended: VPS Deployment (Ubuntu)

### Step 1: Server Setup

#### 1.1. Create VPS Instance
- Choose Ubuntu 22.04 LTS
- Minimum specs: 1GB RAM, 1 CPU, 25GB SSD
- Recommended: 2GB RAM, 2 CPU, 50GB SSD

#### 1.2. Initial Server Security
```bash
# SSH into your server
ssh root@your-server-ip

# Update system packages
apt update && apt upgrade -y

# Create a new user (replace 'duroos' with your preferred username)
adduser duroos
usermod -aG sudo duroos

# Setup firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Switch to new user
su - duroos
```

### Step 2: Install Required Software

```bash
# Install Node.js 20.x (as specified in package.json)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install Certbot for SSL (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
```

### Step 3: Clone and Setup Application

```bash
# Navigate to application directory
cd /home/duroos

# Clone your repository (use your actual repo URL)
git clone https://github.com/your-username/wurud.git
cd wurud

# Install dependencies
npm install --production

# Create uploads directory
mkdir -p uploads
chmod 755 uploads
```

### Step 4: Configure Environment Variables

```bash
# Create production .env file
nano .env
```

**Production .env configuration:**

```bash
# Server Configuration
NODE_ENV=production
PORT=3000

# MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/duroos?retryWrites=true&w=majority

# Session Secret (GENERATE A NEW STRONG SECRET!)
SESSION_SECRET=YOUR_STRONG_RANDOM_SECRET_HERE

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-production-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-production-client-secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback

# Admin Email Whitelist
ADMIN_EMAILS=admin1@yourdomain.com,admin2@yourdomain.com

# File Upload Configuration
UPLOAD_DIR=/home/duroos/wurud/uploads
MAX_FILE_SIZE=62914560

# Production URL
SITE_URL=https://yourdomain.com
```

**Important**:
- Generate a strong SESSION_SECRET: `openssl rand -base64 32`
- Update GOOGLE_CALLBACK_URL with your production domain
- Update ADMIN_EMAILS with actual admin email addresses
- Set absolute path for UPLOAD_DIR

### Step 5: Setup PM2 Process Manager

```bash
# Start the application with PM2
pm2 start server.js --name duroos

# Configure PM2 to start on system boot
pm2 startup systemd
# Run the command that PM2 outputs

# Save PM2 process list
pm2 save

# Monitor logs
pm2 logs duroos

# Other useful PM2 commands:
# pm2 restart duroos    # Restart app
# pm2 stop duroos       # Stop app
# pm2 status            # Check status
# pm2 monit             # Monitor resources
```

### Step 6: Configure Nginx Reverse Proxy

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/duroos
```

**Nginx configuration:**

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Increase client body size for audio uploads (60MB)
    client_max_body_size 65M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for audio streaming
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/duroos /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Step 7: Setup SSL with Let's Encrypt

```bash
# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow the prompts:
# - Enter your email
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (recommended: Yes)

# Test auto-renewal
sudo certbot renew --dry-run

# Certbot will automatically renew certificates before expiration
```

### Step 8: Configure Google OAuth for Production

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to "APIs & Services" > "Credentials"
4. Edit your OAuth 2.0 Client ID
5. Add authorized redirect URIs:
   - `https://yourdomain.com/auth/google/callback`
6. Update your `.env` file with the production callback URL

### Step 9: Database Setup (MongoDB Atlas)

If using MongoDB Atlas:

1. Create a production cluster
2. Set up database user with strong password
3. Whitelist your server IP address (or 0.0.0.0/0 for any IP)
4. Get connection string and update `MONGODB_URI` in `.env`
5. Import your data if migrating:
   ```bash
   # Export from development
   mongodump --uri="mongodb://localhost/duroos" --out=./backup

   # Import to production
   mongorestore --uri="your-production-mongodb-uri" ./backup
   ```

### Step 10: Final Checks

```bash
# Restart application
pm2 restart duroos

# Check logs for any errors
pm2 logs duroos

# Test the application
curl https://yourdomain.com/health

# Monitor server resources
pm2 monit
```

---

## Post-Deployment Tasks

### 1. Set up Monitoring

```bash
# PM2 Monitoring (optional, but useful)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 2. Set up Backups

**Database Backups:**
```bash
# Create backup script
nano /home/duroos/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/duroos/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup MongoDB (update with your MongoDB URI)
mongodump --uri="your-mongodb-uri" --out="$BACKUP_DIR/db_$DATE"

# Keep only last 7 days of backups
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed: $DATE"
```

```bash
# Make executable
chmod +x /home/duroos/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /home/duroos/backup-db.sh >> /home/duroos/backup.log 2>&1
```

**File Backups:**
```bash
# Backup uploads directory
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz uploads/
```

### 3. Server Monitoring

Consider setting up:
- **Uptime monitoring**: UptimeRobot, Pingdom
- **Error tracking**: Sentry
- **Performance monitoring**: New Relic, DataDog (free tiers available)

### 4. Security Hardening

```bash
# Keep system updated
sudo apt update && sudo apt upgrade -y

# Set up automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades

# Configure fail2ban to prevent brute force
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## Maintenance & Updates

### Deploying Updates

```bash
# SSH into server
ssh duroos@your-server-ip

# Navigate to app directory
cd /home/duroos/wurud

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install --production

# Restart application
pm2 restart duroos

# Monitor logs for errors
pm2 logs duroos --lines 50
```

### Rolling Back

```bash
# If something goes wrong
git log --oneline  # Find previous commit hash
git reset --hard <commit-hash>
pm2 restart duroos
```

---

## Alternative: Deploy to Render.com (Easier Option)

### Step 1: Prepare Repository

Ensure your GitHub repository has:
- Latest code pushed
- `.env.example` file (but not `.env`)

### Step 2: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Click "New +" > "Web Service"

### Step 3: Configure Service

- **Repository**: Select your wurud repository
- **Name**: duroos
- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free or Starter ($7/month)

### Step 4: Add Environment Variables

In Render dashboard, add all environment variables from your `.env` file:
- NODE_ENV=production
- MONGODB_URI=your-mongodb-uri
- SESSION_SECRET=random-secret
- GOOGLE_CLIENT_ID=...
- GOOGLE_CLIENT_SECRET=...
- GOOGLE_CALLBACK_URL=https://your-app.onrender.com/auth/google/callback
- ADMIN_EMAILS=...
- UPLOAD_DIR=/opt/render/project/src/uploads
- MAX_FILE_SIZE=62914560
- SITE_URL=https://your-app.onrender.com

### Step 5: Deploy

- Click "Create Web Service"
- Render will automatically deploy
- Use the provided URL or connect custom domain

### Notes on Render:
- Free tier has cold starts (app sleeps after 15 min inactivity)
- Starter plan ($7/month) keeps app always running
- Automatic SSL included
- Auto-deploys on git push

---

## Troubleshooting

### Application won't start
```bash
# Check PM2 logs
pm2 logs duroos --lines 100

# Check Node.js version
node --version  # Should be >= 20

# Check environment variables
pm2 env 0
```

### Database connection errors
- Verify MongoDB URI is correct
- Check if server IP is whitelisted in MongoDB Atlas
- Test connection: `mongo "your-mongodb-uri"`

### Google OAuth not working
- Verify callback URL matches Google Console settings
- Check if domain is added to authorized domains
- Ensure `SESSION_SECRET` is set

### SSL certificate issues
```bash
# Renew certificate manually
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

### High memory usage
```bash
# Check memory
free -h

# Restart application
pm2 restart duroos

# Consider upgrading server resources
```

---

## Cost Estimation

### VPS Option (Monthly)
- VPS (2GB RAM): $6-12
- Domain name: $1-2/month (annual)
- MongoDB Atlas (Free tier): $0
- **Total: ~$7-14/month**

### Render.com Option (Monthly)
- Render Starter: $7
- Domain name: $1-2/month
- MongoDB Atlas (Free tier): $0
- **Total: ~$8-9/month**

---

## Support & Monitoring

### Useful Commands

```bash
# Server status
pm2 status
systemctl status nginx
df -h  # Disk usage
free -m  # Memory usage
htop  # Resource monitor

# Application logs
pm2 logs duroos --lines 100
sudo tail -f /var/log/nginx/error.log

# Restart everything
pm2 restart duroos
sudo systemctl restart nginx
```

### Health Check Endpoint

Your app has a health check at: `https://yourdomain.com/health`

Set up external monitoring to ping this endpoint every 5 minutes.

---

## Next Steps After Deployment

1. **Test thoroughly** on production
2. **Import production data** (lectures, sheikhs, series)
3. **Create admin accounts** via Google OAuth
4. **Monitor logs** for first 24-48 hours
5. **Set up automated backups**
6. **Configure monitoring alerts**
7. **Document any production-specific configurations**

---

## Need Help?

Common issues and solutions are in the Troubleshooting section above. For VPS management, consult your provider's documentation:
- DigitalOcean: https://docs.digitalocean.com
- Linode: https://www.linode.com/docs/
- AWS: https://docs.aws.amazon.com

Good luck with your deployment! 
