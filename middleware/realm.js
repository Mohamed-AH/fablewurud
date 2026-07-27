/**
 * Realm middleware — Two Separate Realms
 *
 * Sets res.locals.realm based on the request path so every template can pick the
 * right palette, brand badge, navigation set, and cross-archive banner target.
 *
 *   /najmi/*  → 'najmi'  (Sheikh Ahmed Al-Najmi — teal/emerald realm)
 *   anything else → 'hasan' (Sheikh Hasan Al-Daghreeri — default gold realm)
 *
 * Content never crosses realms: Najmi routes always filter by the Najmi sheikhId.
 */
module.exports = function realmMiddleware(req, res, next) {
  res.locals.realm = req.path === '/najmi' || req.path.startsWith('/najmi/') || req.path.startsWith('/najmi?')
    ? 'najmi'
    : 'hasan';
  next();
};
