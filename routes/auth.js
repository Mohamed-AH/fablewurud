const express = require('express');
const router = express.Router();
const passport = require('../config/passport');

// @route   GET /auth/google
// @desc    Initiate Google OAuth flow
// @access  Public
router.get('/google', (req, res, next) => {
  // Store returnTo in session for post-auth redirect
  if (req.query.returnTo) {
    req.session.returnTo = req.query.returnTo;
  }
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

// @route   GET /auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/admin/login?error=unauthorized',
    failureMessage: true
  }),
  (req, res) => {
    // Check for returnTo in session
    const returnTo = req.session.returnTo;
    delete req.session.returnTo;

    // Redirect based on role
    if (req.user && req.user.role === 'articleEditor') {
      res.redirect(returnTo || '/article-editor');
    } else {
      res.redirect(returnTo || '/admin/dashboard');
    }
  }
);

// @route   GET /auth/logout
// @desc    Logout user
// @access  Private
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
      res.redirect('/admin/login');
    });
  });
});

// @route   GET /auth/status
// @desc    Check authentication status (for API calls)
// @access  Public
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        displayName: req.user.displayName,
        profilePhoto: req.user.profilePhoto
      }
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

module.exports = router;
