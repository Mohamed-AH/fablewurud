// Export all models from a single entry point
// Note: Transcript and SearchLog use a separate DB connection (see config/searchDatabase.js)
const { transcriptSchema } = require('./Transcript');
const { searchLogSchema } = require('./SearchLog');

// Search models (initialized with separate connection)
let Transcript = null;
let SearchLog = null;

/**
 * Initialize search models with the search database connection
 * @param {mongoose.Connection} searchConnection
 */
function initSearchModels(searchConnection) {
  if (!searchConnection) {
    console.warn('⚠️  Search connection not available - search models not initialized');
    return;
  }
  Transcript = searchConnection.model('Transcript', transcriptSchema);
  SearchLog = searchConnection.model('SearchLog', searchLogSchema);
  console.log('✅ Search models initialized (Transcript, SearchLog)');
}

module.exports = {
  Lecture: require('./Lecture'),
  Sheikh: require('./Sheikh'),
  Series: require('./Series'),
  Section: require('./Section'),
  Admin: require('./Admin'),
  Schedule: require('./Schedule'),
  SiteSettings: require('./SiteSettings'),
  PageView: require('./PageView'),
  Counter: require('./Counter'),
  Article: require('./Article'),
  // Search models (getter functions to ensure they're initialized)
  get Transcript() { return Transcript; },
  get SearchLog() { return SearchLog; },
  initSearchModels
};
