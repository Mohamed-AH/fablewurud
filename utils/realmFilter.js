/**
 * Realm query filters — keep the default (Hasan) realm free of Najmi content.
 *
 * The default site historically showed "all" content, but with the Najmi archive
 * living in its own /najmi realm, the Hasan-side surfaces (homepage tabs, /series,
 * /browse, /sheikhs) must EXCLUDE the Najmi sheikh's series/lectures. These helpers
 * return a Mongo filter fragment to spread into those queries.
 *
 * If the Najmi sheikh can't be resolved (e.g. not yet imported), the fragment is
 * empty and behaviour is unchanged.
 */
const { getNajmiSheikh } = require('./najmiSheikh');

// Exclude Najmi documents that carry a `sheikhId` field (Series, Lecture, Publication)
async function excludeNajmiBySheikh() {
  const najmi = await getNajmiSheikh();
  return najmi ? { sheikhId: { $ne: najmi._id } } : {};
}

// Exclude the Najmi sheikh from a Sheikh listing (by _id)
async function excludeNajmiSheikhId() {
  const najmi = await getNajmiSheikh();
  return najmi ? { _id: { $ne: najmi._id } } : {};
}

module.exports = { excludeNajmiBySheikh, excludeNajmiSheikhId };
