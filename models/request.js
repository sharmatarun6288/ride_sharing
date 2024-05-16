const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    pickupLocation: String,
    destination: String,
    fare: Number,
    currentPassengers: { type: Number, default: 0 },
    status: { type: String, default: 'pending' }, // Can be 'pending', 'accepted', 'declined'
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null } // Reference to driver who accepted the request
});


// const Driver = mongoose.model('Driver', driverSchema);

module.exports = mongoose.model('Request', requestSchema);