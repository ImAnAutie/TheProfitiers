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

  console.log(document)
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
  var rating = doc.data().rating

  console.log(`Business: ${businessId} rated: ${rating}`)

  var businessRef = db.collection('businesses').doc(businessId)
  return db.runTransaction(transaction => {
    return transaction.get(businessRef).then(restDoc => {
      var newNumRatings = restDoc.data().numRatings + 1
      var oldRatingTotal = restDoc.data().score * restDoc.data().numRatings
      var newScore = (oldRatingTotal + rating) / newNumRatings

      return transaction.update(businessRef, {
        score: newScore,
        numRatings: newNumRatings
      })
    })
  })
})

exports.addLatestReviewToBusinessDoc = functions.firestore.document('businesses/{businessId}/reviews/{reviewId}').onCreate((doc, context) => {
  const businessId = context.params.businessId
  var comment = doc.data().comment

  console.log(`Business: ${businessId} latest review comment: ${comment}`)

  var businessRef = db.collection('businesses').doc(businessId)
  return businessRef.update({
    latestReview: comment
  })
})

exports.existingBusinessSubmitReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    return {
      status: false,
      reasonUser: 'Sign in required to submit a review'
    }
  }

  var business=await db.collection('businesses').doc(data.businessId).get()
  if (!business.exists) {
   return {
     status: false,
     reasonUser: 'Business does not exist',
     data: data
    }
  }


  var existingReviews=await db.collection("businesses").doc(data.businessId).collection("reviews").where("user","==",context.auth.uid).get()
  if (!existingReviews.empty) {
   return {
     status: false,
     reasonUser: 'You have already submitted a review for this business.\nTo change your rating for this business please contact a member of the team',
     data: data
    }
  }

  await db.collection("businesses").doc(data.businessId).collection("reviews").doc().set({
    user: context.auth.uid,
    comment: data.comment,
    rating: Number(data.rating),
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  })

  return {
    status: true,
    reasonUser: 'Review submitted',
    data: data
  }
})


exports.newBusinessSubmit = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    return {
      status: false,
      reasonUser: 'Sign in required to submit a review'
    }
  }

  businessDoc=db.collection("businesses").doc()
  lat=Number(data.lat);
  lng=Number(data.lng);
   await businessDoc.set({
    coordinates:  new admin.firestore.GeoPoint(lat,lng),
    geohash: Geohash.encode(lat,lng, 9),
    name: data.name,
    numRatings: 0,
    score: 0,
    submittedBy: context.auth.uid
  })

  return {
    status: true,
    reasonUser: 'Review submitted',
    businessId: businessDoc.id,
    data: data
  }
})
