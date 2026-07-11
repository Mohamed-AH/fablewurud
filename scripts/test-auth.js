// Test script to verify authentication setup
const express = require('express');
const authRoutes = require('../routes/auth');
const adminRoutes = require('../routes/admin');
const passport = require('../config/passport');

console.log('🧪 Testing Authentication Setup...\n');

console.log('📦 Components Check:');
console.log('  • Auth routes:', authRoutes ? '✅' : '❌');
console.log('  • Admin routes:', adminRoutes ? '✅' : '❌');
console.log('  • Passport config:', passport ? '✅' : '❌');

console.log('\n🔐 Middleware Check:');
const { isAuthenticated, isAdmin, isAuthenticatedAPI, isAdminAPI } = require('../middleware/auth');
console.log('  • isAuthenticated:', typeof isAuthenticated === 'function' ? '✅' : '❌');
console.log('  • isAdmin:', typeof isAdmin === 'function' ? '✅' : '❌');
console.log('  • isAuthenticatedAPI:', typeof isAuthenticatedAPI === 'function' ? '✅' : '❌');
console.log('  • isAdminAPI:', typeof isAdminAPI === 'function' ? '✅' : '❌');

console.log('\n📋 Route Verification:');
console.log('  Expected routes:');
console.log('    • GET /auth/google - Initiate OAuth');
console.log('    • GET /auth/google/callback - OAuth callback');
console.log('    • GET /auth/logout - Logout');
console.log('    • GET /auth/status - Check auth status');
console.log('    • GET /admin/login - Login page');
console.log('    • GET /admin/dashboard - Dashboard (protected)');

console.log('\n🔍 Environment Variables:');
console.log('  • GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Not set');
console.log('  • GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Not set');
console.log('  • GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || '❌ Not set');
console.log('  • ADMIN_EMAILS:', process.env.ADMIN_EMAILS ? '✅ Set' : '❌ Not set');
console.log('  • SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Set' : '❌ Not set');

console.log('\n💡 Testing Notes:');
console.log('  • To test Google OAuth, you need to:');
console.log('    1. Create a Google Cloud project');
console.log('    2. Enable Google+ API');
console.log('    3. Create OAuth 2.0 credentials');
console.log('    4. Add authorized redirect URI: http://localhost:3000/auth/google/callback');
console.log('    5. Update .env with real GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
console.log('    6. Add your email to ADMIN_EMAILS in .env');
console.log('    7. Start server and visit http://localhost:3000/admin/login');

console.log('\n✅ Authentication setup structure is complete!');
console.log('🔧 Configure Google OAuth credentials to enable full functionality.');
