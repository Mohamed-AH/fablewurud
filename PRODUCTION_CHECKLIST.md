# Production Readiness Checklist

Use this checklist to ensure your Duroos platform is ready for production deployment.

## 📋 Pre-Deployment

### ✅ Code & Testing
- [ ] All features tested locally (see `TESTING_CHECKLIST.md`)
- [ ] No console errors in browser DevTools
- [ ] All sorting features working (lectures, series, khutba)
- [ ] Audio playback tested on multiple browsers
- [ ] Mobile responsive layout verified
- [ ] Latest code committed and pushed to repository

### ✅ Environment Configuration
- [ ] Copied `.env.production` to `.env`
- [ ] Updated `NODE_ENV=production`
- [ ] Generated strong `SESSION_SECRET` (min 32 characters)
- [ ] Configured production `MONGODB_URI`
- [ ] Set correct `UPLOAD_DIR` path (absolute path)
- [ ] Updated `SITE_URL` with production domain
- [ ] Verified `.env` is in `.gitignore` (NEVER commit it!)

### ✅ Google OAuth Setup
- [ ] Created Google Cloud Project
- [ ] Enabled Google OAuth 2.0 API
- [ ] Created OAuth 2.0 credentials
- [ ] Added authorized JavaScript origins: `https://yourdomain.com`
- [ ] Added authorized redirect URI: `https://yourdomain.com/auth/google/callback`
- [ ] Copied `GOOGLE_CLIENT_ID` to `.env`
- [ ] Copied `GOOGLE_CLIENT_SECRET` to `.env`
- [ ] Updated `GOOGLE_CALLBACK_URL` in `.env`
- [ ] Added real admin emails to `ADMIN_EMAILS`

### ✅ Database Setup
- [ ] Created MongoDB Atlas account (or alternative)
- [ ] Created production database cluster
- [ ] Created database user with strong password
- [ ] Whitelisted server IP (or 0.0.0.0/0 for any IP)
- [ ] Tested connection from local machine
- [ ] Copied connection string to `MONGODB_URI`
- [ ] Decided on backup strategy

### ✅ Domain & SSL
- [ ] Purchased domain name
- [ ] Configured DNS A record to point to server IP
- [ ] Verified DNS propagation (use `nslookup yourdomain.com`)
- [ ] Ready to obtain SSL certificate (Let's Encrypt)

---

## 🚀 Deployment

### ✅ Server Setup (VPS)
- [ ] Created VPS instance (DigitalOcean, Linode, etc.)
- [ ] SSH access configured
- [ ] Non-root user created with sudo privileges
- [ ] Firewall configured (UFW)
  - [ ] Port 22 (SSH) open
  - [ ] Port 80 (HTTP) open
  - [ ] Port 443 (HTTPS) open
- [ ] Firewall enabled

### ✅ Software Installation
- [ ] Node.js 20.x installed
- [ ] npm installed
- [ ] PM2 installed globally (`npm install -g pm2`)
- [ ] Nginx installed
- [ ] Certbot installed

### ✅ Application Deployment
- [ ] Repository cloned to server
- [ ] Dependencies installed (`npm install --production`)
- [ ] `.env` file created and configured
- [ ] `uploads/` directory created with proper permissions
- [ ] `logs/` directory created (if using PM2)
- [ ] Application started with PM2 (`pm2 start server.js --name duroos`)
- [ ] PM2 configured to start on boot (`pm2 startup` + `pm2 save`)

### ✅ Nginx Configuration
- [ ] Nginx config file created at `/etc/nginx/sites-available/duroos`
- [ ] Updated `server_name` with actual domain
- [ ] Symlink created to `/etc/nginx/sites-enabled/`
- [ ] Removed default Nginx site
- [ ] Nginx config tested (`sudo nginx -t`)
- [ ] Nginx restarted

### ✅ SSL Certificate
- [ ] Certbot run for domain (`sudo certbot --nginx -d yourdomain.com`)
- [ ] HTTPS redirect configured (certbot does this automatically)
- [ ] Certificate auto-renewal tested (`sudo certbot renew --dry-run`)
- [ ] Verified site loads with HTTPS

---

## 🧪 Post-Deployment Testing

### ✅ Basic Functionality
- [ ] Homepage loads correctly over HTTPS
- [ ] No console errors in browser DevTools
- [ ] All tabs work (محاضرات, سلاسل, خطب)
- [ ] Search functionality works
- [ ] Category filtering works
- [ ] Date sorting works on all tabs
- [ ] Series expansion and lecture sorting works
- [ ] Khutba expansion and lecture sorting works ✅ **FIXED**
- [ ] Audio playback works
- [ ] Arabic text displays correctly (RTL)

### ✅ Authentication
- [ ] Google OAuth login works
- [ ] Admin users can access `/admin` dashboard
- [ ] Non-admin users cannot access admin routes
- [ ] Logout works
- [ ] Session persistence works

### ✅ Admin Dashboard
- [ ] Can view lectures list
- [ ] Can create new lecture
- [ ] Can edit lecture
- [ ] Can delete lecture
- [ ] Can upload audio file
- [ ] Can manage sheikhs
- [ ] Can manage series
- [ ] Can manage users

### ✅ Performance
- [ ] Health check endpoint responds: `https://yourdomain.com/health`
- [ ] Page load time acceptable (< 3 seconds)
- [ ] Audio streaming works smoothly
- [ ] No memory leaks after extended use

### ✅ Mobile Testing
- [ ] Site loads correctly on mobile
- [ ] Touch controls work
- [ ] Audio player works on mobile
- [ ] Layout is responsive

---

## 🔒 Security Checklist

### ✅ Application Security
- [ ] `NODE_ENV=production` set
- [ ] Strong `SESSION_SECRET` configured
- [ ] Secure cookies enabled (automatic in production)
- [ ] Helmet.js enabled (already configured)
- [ ] HTTPS enforced (via Nginx redirect)
- [ ] Admin routes protected with authentication
- [ ] File upload restrictions in place
- [ ] No sensitive data exposed in client-side code

### ✅ Server Security
- [ ] Firewall enabled and configured
- [ ] Non-root user for application
- [ ] SSH keys configured (password auth disabled recommended)
- [ ] Fail2ban installed (optional but recommended)
- [ ] Automatic security updates enabled
- [ ] Server timezone set correctly
- [ ] Log monitoring in place

### ✅ Database Security
- [ ] Strong database password
- [ ] IP whitelist configured (if using MongoDB Atlas)
- [ ] Database backups configured
- [ ] Connection string secured (not exposed)

---

## 📊 Monitoring & Maintenance

### ✅ Monitoring Setup
- [ ] PM2 monitoring active (`pm2 status`)
- [ ] Log rotation configured (`pm2 install pm2-logrotate`)
- [ ] Uptime monitoring configured (UptimeRobot, Pingdom, etc.)
- [ ] Error tracking considered (Sentry, optional)
- [ ] Server resource monitoring (optional: New Relic, DataDog)

### ✅ Backup Strategy
- [ ] Database backup script created
- [ ] Backup cron job configured (daily recommended)
- [ ] Uploads directory backup plan
- [ ] Tested backup restoration process
- [ ] Offsite backup storage configured (optional)

### ✅ Maintenance Plan
- [ ] Documented deployment process
- [ ] Update procedure documented (see `DEPLOYMENT_GUIDE.md`)
- [ ] Rollback procedure documented
- [ ] Emergency contact information saved
- [ ] Server access credentials secured

---

## 📝 Documentation

### ✅ Documentation Complete
- [ ] `README.md` updated with production info
- [ ] Environment variables documented
- [ ] API endpoints documented (if exposing publicly)
- [ ] Admin user guide created (optional)
- [ ] Development setup guide updated

---

## 🎯 Launch Checklist

### ✅ Final Checks Before Going Live
- [ ] All checklist items above completed
- [ ] Tested on production environment
- [ ] Verified with at least 2 different people
- [ ] Analytics/tracking configured (if needed)
- [ ] Social media links added (if applicable)
- [ ] Contact information updated
- [ ] Terms of service / privacy policy added (if required)
- [ ] Announcement/marketing prepared

### ✅ Launch Day
- [ ] Monitor logs for errors (`pm2 logs duroos`)
- [ ] Monitor server resources (`pm2 monit`)
- [ ] Check uptime monitoring alerts
- [ ] Test from multiple devices/networks
- [ ] Be available for emergency fixes

---

## 🚨 Emergency Contacts

**Server Provider Support:**
- Provider: _________________
- Support: _________________

**Technical Team:**
- Admin: _________________
- Developer: _________________

**Important URLs:**
- Production: _________________
- Admin Panel: _________________/admin
- Health Check: _________________/health
- MongoDB Atlas: https://cloud.mongodb.com
- Google Cloud Console: https://console.cloud.google.com

---

## 📚 Related Documentation

- **Testing**: See `TESTING_CHECKLIST.md` for detailed testing procedures
- **Deployment**: See `DEPLOYMENT_GUIDE.md` for step-by-step deployment
- **Google OAuth**: See `docs/GOOGLE_OAUTH_SETUP.md` for OAuth configuration

---

## ✅ Sign-off

- [ ] Technical lead reviewed and approved
- [ ] Stakeholders notified of launch date
- [ ] Support team briefed
- [ ] Launch communication sent

**Deployed by:** _______________
**Date:** _______________
**Production URL:** _______________

---

## 🎉 You're Ready!

Once all items are checked, your Duroos platform is production-ready!

Remember:
- Monitor logs closely for the first 24-48 hours
- Have a rollback plan ready
- Keep backups current
- Update regularly for security patches

**Good luck with your launch! 🚀**
