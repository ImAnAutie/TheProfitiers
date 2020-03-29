const functions = require('firebase-functions')
const Geohash = require('ngeohash')

const admin = require('firebase-admin')

try {
  admin.initializeApp()
} catch (e) {
  // yes this is meant to be empty
}
const db = admin.firestore()

exports.generateGeoHashForBusiness = functions.firestore.document('businesses/{businessId}').onWrite((change, context) => {
  const document = change.after.exists ? change.after.data() : null
  const businessId = context.params.businessId
  if (!document) {
    console.log(`${businessId} deleted, not generating geohash`)
    return
  }

  console.log(document);
  var geohash = Geohash.encode(document.coordinates.latitude, document.coordinates.longitude, 9)
  console.log(geohash)

  if (geohash === document.geohash) {
    console.log('Geohash not changed, not updating doc')
    return
  }

  return db.collection('businesses').doc(businessId).update({
    geohash: geohash
  })
})


exports.generateRatingForReview = functions.firestore.document('businesses/{businessId}/reviews/{reviewId}').onCreate((doc, context) => {
  const businessId = context.params.businessId
  var rating=doc.data().rating;

  console.log(`Business: ${businessId} rated: ${rating}`);

  var businessRef = db.collection("businesses").doc(businessId);
  return db.runTransaction(transaction => {
    return transaction.get(businessRef).then(restDoc => {
      var newNumRatings = restDoc.data().numRatings + 1;
      var oldRatingTotal = restDoc.data().score * restDoc.data().numRatings;
      var newScore = (oldRatingTotal + rating) / newNumRatings;

      return transaction.update(businessRef, {
        score: newScore,
        numRatings: newNumRatings
      });
    });
  });
})

exports.addLatestReviewToBusinessDoc = functions.firestore.document('businesses/{businessId}/reviews/{reviewId}').onCreate((doc, context) => {
  const businessId = context.params.businessId
  var comment=doc.data().comment;

  console.log(`Business: ${businessId} latest review comment: ${comment}`);

  var businessRef = db.collection("businesses").doc(businessId);
  return businessRef.update({
    latestReview: comment
  });
})
