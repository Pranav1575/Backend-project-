const express=require('express');
const app=express();
const mongoose=require('mongoose');
const path=require('path');
const Listing=require('./models/listing');
const Review=require('./models/reviews');
const User = require("./models/user");
let engine = null;
try {
    engine = require('ejs-mate');
} catch (err) {
    console.warn("ejs-mate not found, using default EJS engine");
}
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const flash = require('connect-flash');
const crypto = require('crypto');
const methodOverride = require("method-override");
const isProduction = process.env.NODE_ENV === "production";
try {
    // Load local .env when present; hosted platforms still use dashboard env vars.
    require("dotenv").config();
} catch (err) {
    // dotenv is optional; app still works with fallback values
}
// In production, only accept explicit Mongo env vars to avoid conflicts
// with platform-provided DATABASE_URL values (often Postgres).
const mongoCandidates = [
    { name: "MONGO_URI", value: process.env.MONGO_URI?.trim() },
    { name: "MONGODB_URI", value: process.env.MONGODB_URI?.trim() },
    ...(!isProduction ? [{ name: "DATABASE_URL", value: process.env.DATABASE_URL?.trim() }] : [])
].filter((candidate) => candidate.value);
const isMongoUri = (uri) =>
    typeof uri === "string" && /^mongodb(\+srv)?:\/\//i.test(uri);
const isLocalMongoUri = (uri) =>
    typeof uri === "string" &&
    /^mongodb(\+srv)?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(uri);

const validMongoCandidates = mongoCandidates.filter((candidate) => isMongoUri(candidate.value));
let rawMongoUri = null;

if (isProduction) {
    const nonLocalMongoUri = validMongoCandidates.find((candidate) => !isLocalMongoUri(candidate.value));
    if (nonLocalMongoUri) {
        rawMongoUri = nonLocalMongoUri.value;
    } else if (validMongoCandidates.length > 0) {
        const localVars = validMongoCandidates.map((candidate) => candidate.name).join(", ");
        throw new Error(
            `Invalid production MongoDB URI: localhost/127.0.0.1 is not reachable in cloud deploys. Update ${localVars} to your MongoDB Atlas connection string.`
        );
    } else if (mongoCandidates.length > 0) {
        const invalidVars = mongoCandidates.map((candidate) => candidate.name).join(", ");
        throw new Error(
            `Invalid MongoDB env value in ${invalidVars}. URI must start with mongodb:// or mongodb+srv://`
        );
    }
} else {
    rawMongoUri = (validMongoCandidates[0] && validMongoCandidates[0].value) || "mongodb://127.0.0.1:27017/BackendProject1";
}

if (!rawMongoUri) {
    throw new Error("MONGO_URI is required in production. Add it to your deployment environment variables.");
}
const mongoUri = rawMongoUri;
const sessionSecret = process.env.SESSION_SECRET?.trim() || (!isProduction ? "mysupersecretkey" : null);
if (!sessionSecret) {
    throw new Error("SESSION_SECRET is required in production. Add it to your deployment environment variables.");
}
if (isProduction) {
    const missingCloudinaryVars = [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET"
    ].filter((name) => !process.env[name] || !process.env[name].trim());

    if (missingCloudinaryVars.length > 0) {
        throw new Error(
            `Missing required Cloudinary env vars in production: ${missingCloudinaryVars.join(", ")}`
        );
    }
}
const multer = require("multer");
const { storage } = require("./cloudConfig");
const upload = multer({ storage });
// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
// parse application/json
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "../frontend/public")));





main().then(() => {
    console.log("MongoDB Connected Successfully");
})

.catch(err => console.log(err));

async function main() {
  await mongoose.connect(mongoUri);

  // use `await mongoose.connect('mongodb://user:password@127.0.0.1:27017/test');` if your database has auth enabled
}

app.set("view engine","ejs");
app.set("views", path.join(__dirname, "../frontend/views"));
if (engine) {
    app.engine("ejs", engine);
}

// session store (use MongoDB, not MemoryStore)
const store = MongoStore.create({
    mongoUrl: mongoUri,
    touchAfter: 24 * 3600
});

store.on('error', (err) => {
    console.error('Session store error:', err);
});
// session configuration (use env var in production)
const sessionOption = {
    secret: sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 1 day
        httpOnly: true,
        secure: app.get('env') === 'production'
    }
};

// initialize session middleware BEFORE routes so req.session is available
app.use(session(sessionOption));

// enable flash messages (requires sessions)
app.use(flash());

// expose flash messages to all views
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currentUser = req.session.userId;
    next();
});

function isLoggedIn(req, res, next) {
    if (!req.session.userId) {
        req.flash("error", "Please login first");
        return res.redirect("/login");
    }
    next();
}

function isListingOwner(listing, userId) {
    if (!listing || !listing.owner || !userId) {
        return false;
    }
    return listing.owner.toString() === userId.toString();
}

async function isOwner(req, res, next) {
    const { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing not found");
        return res.redirect("/listings");
    }
    if (!isListingOwner(listing, req.session.userId)) {
        req.flash("error", "Only the owner can do that");
        return res.redirect(`/listings/${id}`);
    }
    next();
}

app.get('/',(req,res)=>{
    // touch the session so a session cookie is created
    req.session.visited = (req.session.visited || 0) + 1;
    res.send("Hello World");

});

// debug route: sets a non-httpOnly test cookie and ensures session exists
app.get('/debug-cookie', (req, res) => {
    req.session.debug = true;
    // set a cookie visible in DevTools and document.cookie (httpOnly: false)
    res.cookie('testcookie', 'hello-world', { maxAge: 60 * 60 * 1000, httpOnly: false });
    res.json({ session: req.session, message: 'Set testcookie and touched session' });
});



//add new listing route
app.get('/listings/new', isLoggedIn, (req,res)=>{
    
    res.render("listing/new");
});
//index route to display all listings
app.get('/listings', isLoggedIn, async (req, res) => {
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
    const selectedCategory = req.query.category;
    const query = categories.includes(selectedCategory) ? { category: selectedCategory } : {};
    const alllistings = await Listing.find(query);
    res.render("listing/index", { alllistings, selectedCategory });      
        
        
              
       });
       

       //show route to display a single listing 
       app.get('/listings/:id', async (req, res) => {
        const { id } = req.params;
        const findid=await Listing.findById(id)
            .populate({
                path: 'reviews',
                populate: {
                    path: 'author'
                }
            })
            .populate('owner')

        if (!findid) {
            req.flash('error', 'Listing not found');
            return res.redirect('/listings');
        }

        res.render("listing/show",{findid});
    
       });

        //create route to add a new listing to the database
         app.post('/listings', isLoggedIn, upload.single("image"), async (req, res) => {
            try {
                if (!req.file || !req.file.path) {
                    req.flash('error', 'Please upload an image');
                    return res.redirect('/listings/new');
                }
                const newlisting = new Listing(req.body.listing);
                newlisting.image = req.file.path;
                newlisting.owner = req.session.userId;
                await newlisting.save();
                req.flash('success', 'New Listing Created Successfully!');
                return res.redirect('/listings');
            } catch (err) {
                console.error('Error creating listing:', err);
                req.flash('error', 'Failed to create listing. Please try again.');
                return res.redirect('/listings/new');
            }
         });

         //edit route to display the edit form for a listing
            app.get('/listings/:id/edit', isLoggedIn, isOwner, async (req, res) => { 
                const findid=await Listing.findById(req.params.id);
                if (!findid) {
                    req.flash("error", "Listing not found");
                    return res.redirect("/listings");
                }
               
                res.render("listing/update",{findid});
             });

             //update route to update a listing in the database
                app.put('/listings/:id', isLoggedIn, isOwner, upload.single("image"), async (req, res) => {
                    const { id } = req.params;
                    try {
                        const updateData = { ...req.body.listing };
                        if (req.file && req.file.path) {
                            updateData.image = req.file.path;
                        }
                        const updatedlisting = await Listing.findByIdAndUpdate(id, updateData, { new: true });
                        if (!updatedlisting) {
                            req.flash('error', 'Listing not found');
                            return res.redirect('/listings');
                        }
                        req.flash('success', 'Listing updated successfully!');
                        return res.redirect(`/listings/${updatedlisting._id}`);
                    } catch (err) {
                        console.error('Error updating listing:', err);
                        req.flash('error', 'Failed to update listing. Please try again.');
                        return res.redirect(`/listings/${id}/edit`);
                    }
                });    

                 // fallback POST route for update form (without method-override)
                 app.post('/listings/:id/update', isLoggedIn, isOwner, upload.single("image"), async (req, res) => {
                     const { id } = req.params;
                     try {
                         const updateData = { ...req.body.listing };
                         if (req.file && req.file.path) {
                             updateData.image = req.file.path;
                         }
                         await Listing.findByIdAndUpdate(id, updateData, { new: true });
                         req.flash('success', 'Listing updated successfully!');
                         return res.redirect(`/listings/${id}`);
                     } catch (err) {
                         console.error('Error updating listing (fallback):', err);
                         req.flash('error', 'Failed to update listing. Please try again.');
                         return res.redirect(`/listings/${id}/edit`);
                     }
                 });

                 // delete route to handle form POST from show.ejs
                 app.post('/listings/:id/delete', isLoggedIn, isOwner, async (req, res) => {
                     const { id } = req.params;
                     await Listing.findByIdAndDelete(id);
                      req.flash('success', 'New Listing delete Successfully!');
                     res.redirect('/listings');
                 });

                 // create review route to add a review to a listing
                 app.post('/listings/:id/reviews', isLoggedIn, async (req, res) => {
                     const { id } = req.params;
                     const listing = await Listing.findById(id);

                     if (!listing) {
                         req.flash('error', 'Listing not found');
                         return res.redirect('/listings');
                     }

                     const newReview = new Review(req.body.review);
                     newReview.author = req.session.userId;
                     await newReview.save();
                     await Listing.findByIdAndUpdate(id, { $push: { reviews: newReview._id } });
                     req.flash('success', 'Review added successfully!');
                     res.redirect(`/listings/${id}`);
                 });

                 // delete review route (form POST)
                 app.post('/listings/:id/reviews/:reviewId/delete', isLoggedIn, async (req, res) => {
                     const { id, reviewId } = req.params;
                     const listing = await Listing.findById(id);
                     const review = await Review.findById(reviewId);

                     if (!listing || !review) {
                         req.flash('error', 'Listing or review not found');
                         return res.redirect('/listings');
                     }

                     const isReviewAuthor = review.author && review.author.toString() === req.session.userId.toString();
                     if (!isReviewAuthor && !isListingOwner(listing, req.session.userId)) {
                         req.flash('error', 'Only the review author or listing owner can delete reviews');
                         return res.redirect(`/listings/${id}`);
                     }

                     await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
                     await Review.findByIdAndDelete(reviewId);
                     req.flash('success', 'Review deleted successfully!');
                     res.redirect(`/listings/${id}`);
                 });
             
//delete route to delete a listing from the database
app.delete('/listings/:id', isLoggedIn, isOwner, async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    res.redirect('/listings');
});    
/*sinup page**/


app.get("/signup", (req, res) => {
    res.render("listing/user");
});

/* post*/

app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const salt = crypto.randomBytes(16).toString("hex");
        const hashedPassword = crypto
            .scryptSync(password, salt, 64)
            .toString("hex");

        const newUser = new User({
            username,
            email,
            password: `${salt}:${hashedPassword}`
        });

        await newUser.save();
        req.session.userId = newUser._id;
        req.session.email = newUser.email;

        req.flash("success", "Account created successfully!");
        res.redirect("/listings");

    } catch (err) {
        req.flash("error", "Signup failed!");
        res.redirect("/signup");
    }
});

/*create a login page*/
// show login page
app.get("/login", (req, res) => {
    res.render("listing/login");
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const foundUser = await User.findOne({ email });

    if (!foundUser) {
        req.flash("error", "User not found");
        return res.redirect("/login");
    }

    const [salt, storedHash] = (foundUser.password || "").split(":");
    if (!salt || !storedHash) {
        req.flash("error", "Invalid account password format");
        return res.redirect("/login");
    }

    const loginHash = crypto.scryptSync(password, salt, 64).toString("hex");
    if (storedHash !== loginHash) {
        req.flash("error", "Wrong password");
        return res.redirect("/login");
    }

    req.session.userId = foundUser._id;
    req.session.email = foundUser.email;
    req.flash("success", "Welcome back!");
    res.redirect("/listings");
});
/*logout page */
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if(err){
            console.log(err);
            return res.redirect("/listings");
        }
        res.clearCookie("connect.sid");
        res.redirect("/login");
    });

});




const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`server is running on port ${PORT}`);
    });
}

module.exports = app;

