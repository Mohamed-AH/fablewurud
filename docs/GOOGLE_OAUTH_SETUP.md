# Google OAuth 2.0 Setup Guide

This guide will help you set up Google OAuth authentication for the Duroos admin panel.

## Prerequisites

- Google account
- Access to Google Cloud Console

## Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" or select an existing project
3. Give your project a name (e.g., "Duroos Admin")
4. Click "Create"

### 2. Enable Google+ API

1. In your project, go to "APIs & Services" > "Library"
2. Search for "Google+ API"
3. Click on it and click "Enable"

### 3. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type (or "Internal" if using Google Workspace)
3. Fill in the required fields:
   - App name: "Duroos Admin"
   - User support email: your email
   - Developer contact email: your email
4. Click "Save and Continue"
5. Skip "Scopes" for now (click "Save and Continue")
6. Add test users if using External type
7. Click "Save and Continue"

### 4. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application"
4. Give it a name (e.g., "Duroos Web Client")
5. Add Authorized JavaScript origins:
   - `http://localhost:3000` (development)
   - Your production domain (when deploying)
6. Add Authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback` (development)
   - Your production callback URL (when deploying)
7. Click "Create"
8. **Copy the Client ID and Client Secret** - you'll need these!

### 5. Update .env File

1. Open your `.env` file
2. Update the following variables with your credentials:

```env
GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-actual-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Add your email to the admin whitelist
ADMIN_EMAILS=your-email@gmail.com
```

### 6. Test Authentication

1. Start the server: `npm run dev`
2. Go to `http://localhost:3000/admin/login`
3. Click "Sign in with Google"
4. Authorize the application
5. You should be redirected to the admin dashboard

## Security Notes

- **Never commit your .env file to git** (it's already in .gitignore)
- Keep your Client Secret secure
- For production:
  - Use a strong SESSION_SECRET (generate random string)
  - Enable HTTPS
  - Update callback URLs to production domain
  - Consider using "Internal" user type if using Google Workspace

## Troubleshooting

### "Unauthorized: Email not in admin whitelist"
- Make sure your email is added to `ADMIN_EMAILS` in `.env`
- Emails are case-insensitive
- Separate multiple emails with commas

### "redirect_uri_mismatch" error
- Make sure the redirect URI in Google Console exactly matches your GOOGLE_CALLBACK_URL
- Include the full URL including protocol (http/https)

### "OAuth2Strategy requires a clientID option"
- Make sure you've set GOOGLE_CLIENT_ID in your .env file
- Restart the server after updating .env

## Production Deployment

When deploying to production:

1. Update OAuth credentials with production domain
2. Add production redirect URI in Google Console
3. Update `.env` on production server:
   ```env
   GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback
   SITE_URL=https://yourdomain.com
   NODE_ENV=production
   ```
4. Ensure HTTPS is enabled
5. Use a secure, random SESSION_SECRET
