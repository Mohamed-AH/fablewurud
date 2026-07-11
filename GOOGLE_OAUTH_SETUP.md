# Google OAuth Setup for Wurud Platform

## 1. Create OAuth 2.0 Credentials

**Google Cloud Console**: https://console.cloud.google.com/apis/credentials

### Required Settings:

**Application Type**: Web application

**Authorized JavaScript origins**:
```
http://localhost:3000
```

**Authorized redirect URIs**:
```
http://localhost:3000/auth/google/callback
```

---

## 2. Environment Variables

Add to `.env`:

```bash
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
SESSION_SECRET=any_random_string_min_32_chars

# Admin email whitelist (comma-separated)
ADMIN_EMAILS=your.email@gmail.com,another.admin@gmail.com
```

---

## 3. Email Whitelist

Only emails listed in `ADMIN_EMAILS` can access the admin panel.

To add yourself:
1. Use your Google account email
2. Add to `ADMIN_EMAILS` in `.env`
3. Restart server

---

## 4. Testing

1. Start server: `npm start`
2. Go to: `http://localhost:3000/admin`
3. Click "Sign in with Google"
4. Authorize with your whitelisted email
5. You should see the admin dashboard

---

## 5. Production Setup (Later)

When deploying, update:

**Authorized JavaScript origins**:
```
https://yourdomain.com
```

**Authorized redirect URIs**:
```
https://yourdomain.com/auth/google/callback
```

And update `.env` with production domain.

---

## Routes

- `/admin` - Admin dashboard (requires auth)
- `/auth/google` - Initiate Google OAuth
- `/auth/google/callback` - OAuth callback
- `/auth/logout` - Logout
- `/auth/status` - Check auth status (JSON)

---

## Admin Features

Once authenticated:
- Upload audio files
- Edit lecture metadata
- Delete lectures
- Manage sheikhs and series
- View statistics

all done
