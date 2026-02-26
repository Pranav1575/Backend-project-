
const mongoose = require("mongoose");

/* -------- Schema -------- */
const Schema = mongoose.Schema;
const listingSchema = new Schema({
    title: {
        type: String,
        required: true
    },

    description: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },



    price: {
        type: Number,
        required: true,
        min: 0
    },

    location: {
        type: String,
        required: true
    },

    country: {
        type: String,
        required: true
    }
,
reviews: [
   {
      type: Schema.Types.ObjectId,
      ref: "Review"
   }
]
,

 category: {
        type: String,
        enum: [
            "trending",
            "rooms",
            "iconic-cities",
            "mountains",
            "castles",
            "amazing-pools",
            "camping",
            "farms"
        ],
        required: true
    },

 owner: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

});

/* -------- Model -------- */
const Listing= mongoose.model("Listing", listingSchema);

module.exports = Listing;
