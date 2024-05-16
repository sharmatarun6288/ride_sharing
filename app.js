const express = require('express')
const app = express();
const path = require('path');
const ejsMate = require('ejs-mate'); 
const http = require('http');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('./models/user');
const Driver = require('./models/driver');
const Request = require('./models/request');
const Feedback = require('./models/feedback');
const mongoose = require('mongoose');
const axios = require('axios');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
// const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const server = http.createServer(app);
const io = new Server(server);
const SECRET_KEY = 'plmkoijnh123';
const users = {};
io.on('connection',socket =>{ 
    socket.on('new-user-joined',name =>{
        console.log(name);
        users[socket.id]=name;
        socket.broadcast.emit('user-joined',name);
    });

    socket.on('send',message =>{
        socket.broadcast.emit('recieve',{message:message,name:users[socket.id]
        });
        console.log(`${message}`)
    });
    socket.on("disconnect", () => {
        console.log("User disconnected");
        socket.broadcast.emit('left',users[socket.id]);
       delete users[socket.id];
      });
});

mongoose.mongoose.connect('mongodb://127.0.0.1:27017/ride-share').
then(()=>{
  console.log('Mongo Connection Open');
})
.catch(err =>{
  console.log("Connection Failed");
  console.log(err);
}) 



app.engine('ejs',ejsMate);  
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.use(express.static(path.join(__dirname,'public')));
app.use(express.urlencoded({extended:true}));
app.use(bodyParser.json());

const sessionConfig = {
    secret:'Thisismysecret',
    resave:true,
    saveUninitialized:true,
    cookie:{
      expires:Date.now() + 1000 * 60 * 60 * 24 *7 ,
      maxAge:1000 * 60 * 60 * 24 *7 
    }
  }
    
  app.use(session(sessionConfig));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new LocalStrategy(User.authenticate()));
  passport.serializeUser(User.serializeUser()); 
  passport.deserializeUser(User.deserializeUser());

app.use((req,res,next)=>{
    res.locals.currentUser = req.user;
    // console.log(res.path);
    res.locals.Drive = req.params.id;

    console.log(req.params.id);
    next();
  }) 

  // Authentication middleware for drivers
  const isLoggedInDriver = (req, res, next) => {
    // Check if the token is provided in the query parameters
    const token = req.query.token;

    if (!token) {
        return res.status(401).json({ message: 'Token not provided' });
    }

    // Verify token
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        // Token is valid, you can access the decoded user information
        req.user = decoded;
        res.locals.currentUser = req.user.email;
        console.log(`abcd;${req.user.email}`);
        next();
    });
}; 



const isLoggedIn = async (req,res,next)=>{
    if(!req.isAuthenticated()) {
        return res.redirect('/login')
    }
  next();
}

app.get('/',(req,res)=>{
  res.render('index'); 
})

app.get('/home',isLoggedIn,(req,res)=>{
  res.render('home');
})

app.get('/contact',isLoggedIn,(req,res)=>{ 
    res.render('contact'); 
}) 

app.get('/services',(req,res)=>{
    res.render('services');
})

app.get('/about',isLoggedIn,(req,res)=>{
    res.render('about');
})

app.get('/login',(req,res)=>{
    res.render('login');
})

app.post('/rideBook', isLoggedIn, async (req, res) => {
  let { pickup, destination ,Passengers} = req.body;
  const api_key = '9wz-2FV-IE2uN4i0Q65I_oeviRfxmbenvcb9ZFHMq6M';

  try {
    const [pickResponse, destResponse] = await Promise.all([
      axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(pickup)}&apiKey=${api_key}`),
      axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(destination)}&apiKey=${api_key}`)
    ]);
    const pickLocation = pickResponse.data.items[0].position;
    const destLocation = destResponse.data.items[0].position;

    const options = {
      method: 'GET',
      url: 'https://taxi-fare-calculator.p.rapidapi.com/search-geo',
      params: {
        dep_lat: pickLocation.lat,
        dep_lng: pickLocation.lng,
        arr_lat: destLocation.lat,
        arr_lng: destLocation.lng
      },
      headers: {
        'X-RapidAPI-Key': 'b4208f1b62msh140e2232c0a7d6fp1d8ba9jsnae186cfb840a',
        'X-RapidAPI-Host': 'taxi-fare-calculator.p.rapidapi.com'
      }
    };
    const response = await axios.request(options);
    console.log(response.data.journey.fares);
    const resp = response.data.journey.fares;

    const byNightObject = resp.find(item => item.name === 'by Day');
    let byNightPriceInCents;
    if (byNightObject) {
      byNightPriceInCents = byNightObject.price_in_cents;
      console.log(byNightPriceInCents);
    }
    afterFare = (byNightPriceInCents * Passengers)/4;
    console.log('Pickup Location:', pickLocation);
    console.log('Destination Location:', destLocation);

    const newRequest = new Request({
      pickupLocation: pickup,
      destination,
      fare: afterFare,
      currentPassengers:Passengers
    });

    // Save the new request to the database
    newRequest.save()
      .then(savedRequest => {
        // Update the user's requestRide field with the ID of the created request
        User.findOneAndUpdate(
          { email: req.user.email },
          { $set: { requestRide: savedRequest._id } },
          { new: true }
        )
          .then(updatedUser => {
            console.log('User updated with ride request:', updatedUser);
          })
          .catch(error => {
            console.error('Error updating user:', error);
          });
      })
      .catch(error => {
        console.error('Error creating ride request:', error);
      });

    const availableDrivers = await Driver.find({ available: true });
    const driverLocations = availableDrivers.map(driver => driver.location);

    const promises = driverLocations.map(async (location) => {
      if (location) { // Check if location is truthy (i.e., not undefined or null)
        const locresponse = await axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(location)}&apiKey=${api_key}`);
        if (locresponse.data.items.length > 0) { // Check if response contains items
          return locresponse.data.items[0].position;
        }
      }
    });
    
    Promise.all(promises)
      .then((positions) => {
        const filteredPositions = positions.filter(pos => pos); // Remove any undefined values
        console.log(filteredPositions);
        res.render('rideBook', {
          pickLocation,
          destLocation,
          pickup,
          destination,
          afterFare,
          fare: byNightPriceInCents,
          locationArray: filteredPositions,
          newRequest
        });
      })
      .catch((error) => {
        console.error('Error fetching driver locations:', error);
        res.status(500).send('Internal Server Error');
      });
    
  } catch (error) {
    console.error('Error:', error);
    // Handle error appropriately
  }
});


app.post('/login',passport.authenticate('local',{failureRedirect:'/login'}),async(req,res)=>{
    res.redirect('/home');
})
app.get('/register',(req,res)=>{
    res.render('register');
})

// Route to fetch available drivers and their locations
app.get('/api/drivers', async (req, res) => {
  try {
      const availableDrivers = await Driver.find({ available: true });
      const driverLocations = availableDrivers.map(driver => driver.location);
      console.log(driverLocations);
      res.json(driverLocations);
  } catch (error) {
      console.error('Error fetching available drivers:', error);
      res.status(500).json({ error: 'Internal Server Error' });
  }
});  


app.post('/register', async (req, res) => {
  const {username,password,email} = req.body;
      const user = new User({
       email,
       username
      });
      const registeredUser = await User.register(user,password);
      req.login(registeredUser,err => {
         console.log(err);
        // req.flash('success','Congrats! You are registered');
        res.redirect('/home');
      })
});

app.get('/logout',(req,res,next)=>{
    req.logout(err =>{
        return next(err);
      });
    res.redirect('/login');
})


// .listen(800);


app.post('/contact', async (req, res) => {
  const { username, feedback } = req.body;
  const f = new Feedback({
    username,
    feedback
  });
  try {
    await f.save();
    // console.log(res);
    return res.send('successss');
  } catch (error) {
    console.error('Error:', error);
    
  }
});

app.get('/driverIndex',(req,res)=>{
  res.render('driver-index');
}) 

// In app.js

// Render driver-login view
app.get('/driver-login', (req, res) => {
  res.render('driver-login', { currentUser: req.user }); // Pass currentUser to the view
});

// Render driver-register view
app.get('/driver-register', (req, res) => {
  res.render('driver-register', { currentUser: req.user }); // Pass currentUser to the view
});

// Render driver-home view
app.get('/driver-home/:id', isLoggedInDriver, async(req, res) => {
  try {
    const token = req.query.token;
    const email = req.user.email;
     // Assuming req.user contains user information after authentication
    const {id} = req.params;
    const driver = await Driver.findOne({ email }).populate('acceptedRides');
    if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
    }
    console.log(driver);
    // res.send(driver);
    // const driver = await Driver.findById(req.user._id).populate('acceptedRides');
    const pendingRequests = await Request.find({ status: 'pending' });
    console.log(`pending Requests = ${pendingRequests}`);

    res.render('driver-home', { driver, requests:pendingRequests,token });
} catch (err) {
    res.status(500).json({ message: err.message });
} 
});
 

// In app.js

app.post('/driver-login', async (req, res) => {
  const { email, password ,location} = req.body;

  try {
      // Find driver by email
      const driver = await Driver.findOne({ email });

      // If driver not found  
      if (!driver) {
          return res.status(404).json({ message: 'Driver not found' });
      }

      // Check password
      const passwordMatch = await bcrypt.compare(password, driver.password);
      if (!passwordMatch) {
          return res.status(401).json({ message: 'Invalid credentials' });
      }
      // console.log(driver._id,driver.email);
      // Generate JWT token
      driver.location = location;
      await driver.save();
      // console.log(driver._id,driver.email);
      const token = jwt.sign({ email: driver.email,id : driver._id}, SECRET_KEY, { expiresIn: '1h' });
      // res.json({token});
      // Redirect to home page after successful login
      res.locals.currentUser = driver;
      res.redirect(`/driver-home/${driver._id}?token=${token}`);
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});
 
  

app.post('/driver-register', async (req, res) => {
  const { name, email, drivingLicense, password, vehicleModel } = req.body;

    // Check if driver already exists
    const existingDriver = await Driver.findOne({ email });
    if (existingDriver) {
        return res.status(400).json({ message: 'Driver already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new driver with completedRides array
    const newDriver = new Driver({
        name,
        email,
        drivingLicense,
        password: hashedPassword,
        vehicleModel,
        acceptedRides: []
    });

    // Save new driver to database
    await newDriver.save();
    
    const token = jwt.sign({email},SECRET_KEY);
    
    res.redirect(`/driver-home/${newDriver._id}?token=${token}`);
}); 

 
// In app.js

app.get('/driver-logout/:id', async (req, res) => {
  try {
      // Get the logged-in driver's ID from the session
      const driverId = req.params.id; // Assuming you're using passport for authentication

      // Find the driver by ID
      const driver = await Driver.findById(driverId);

      // If the driver is found, remove the license number field and save the changes
      if (driver) {
          driver.location = undefined; // Remove license number
          await driver.save();
      } else {
          return res.status(404).json({ message: 'Driver not found' });
      }
      
      res.redirect('/driver-login'); // Redirect to driver login page after logout
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ message: 'Internal Server Error' });
  }
});


app.get('/accept-request/:Did/:Rid',isLoggedInDriver, async (req, res) => {
  const api_key = '9wz-2FV-IE2uN4i0Q65I_oeviRfxmbenvcb9ZFHMq6M';
  const requestId = req.params.Rid;
  const driverId = req.params.Did; // assuming req.driver is set in middleware

  try {
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    request.status = 'accepted';
    request.driver = driverId;
    await request.save();
    const driver = await Driver.findById(driverId);
    driver.acceptedRides.push(requestId);
    await driver.save();

    const driverLocation = driver.location;
    
    const dResponse = await axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(driverLocation)}&apiKey=${api_key}`);
  if (!dResponse.data || !dResponse.data.items || dResponse.data.items.length === 0) {
    return res.status(404).json({ error: 'Driver location not found' });
  }
  console.log(dResponse.data.items);
  const dLocation = dResponse.data.items[0].position; 
    const pickup = request.pickupLocation;
    const destination = request.destination;
    console.log(pickup,destination);
    const [pickResponse, destResponse] = await Promise.all([
      axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(pickup)}&apiKey=${api_key}`),
      axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(destination)}&apiKey=${api_key}`)
    ]).catch(error => {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    });
      const pickLocation = pickResponse.data.items[0].position;
      const destLocation = destResponse.data.items[0].position;
       res.render('request_ride',{dLocation,pickLocation,destLocation});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.get('/requestRide/:id',async(req,res)=>{
  const api_key = '9wz-2FV-IE2uN4i0Q65I_oeviRfxmbenvcb9ZFHMq6M';
  const {id} = req.params;

  const request = await Request.findById(id);
  const pickup = request.pickupLocation;
  const destination = request.destination;
  
  try {
    const [pickResponse, destResponse] = await Promise.all([
      axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(pickup)}&apiKey=${api_key}`),
      axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(destination)}&apiKey=${api_key}`)
    ]);
    const pickLocation = pickResponse.data.items[0].position;
    const destLocation = destResponse.data.items[0].position;

    console.log('Pickup Location:', pickLocation);
    console.log('Destination Location:', destLocation);

    const d_id = request.driver;
    
    const driver = await Driver.findById(d_id);

    const driverLocation = driver.location;
    
    const dResponse = await axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(driverLocation)}&apiKey=${api_key}`);
    if (!dResponse.data || !dResponse.data.items || dResponse.data.items.length === 0) {
      return res.status(404).json({ error: 'Driver location not found' });
    }
    console.log(dResponse.data.items);
    const dLocation = dResponse.data.items[0].position;
    
   res.render('request_ride',{dLocation,pickLocation,destLocation}); 
  } catch (error) {
    console.error('Error:', error);
    // Handle error appropriately  
  }
}) 

server.listen(3000,(req,res)=>{
    console.log('App is listening at PORT 3000'); 
}) 
    
