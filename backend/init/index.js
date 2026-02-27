const mongoose = require('mongoose');
const Listing = require('../models/listing');        
const initData = require('./data.js');


main()
  .then(async () => {
    console.log("MongoDB Connected Successfully");
    await initDB();
    process.exit(0);
  })
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });


async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/BackendProject1');

  // use `await mongoose.connect('mongodb://user:password@127.0.0.1:27017/test');` if your database has auth enabled
}
//
const initDB = async () =>{
   /* It first deletes all existing listings and then inserts the sample data from the data.js file. This is useful for testing and development purposes to ensure that the database has consistent data.*/
  //await Listing.deleteMany({});
  const ownerId = new mongoose.Types.ObjectId("699bf4656c6214abe41e7b91");
  const categories = [
    "trending",
    "rooms",
    "iconic-cities",
    "mountains",
    "castles",
    "amazing-pools",
    "camping",
    "farms"
  ];
  const listingsWithOwner = initData.data.map((obj, index) => ({
    ...obj,
    image: typeof obj.image === "string" ? obj.image : obj.image?.url,
    category: obj.category || categories[index % categories.length],
    owner: ownerId
  }));

  // Insert sample data into the database
   await Listing.insertMany(listingsWithOwner);
    console.log("Database connected Successfully");  
     
     
}
