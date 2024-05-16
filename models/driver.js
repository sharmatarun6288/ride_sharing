// driverModel.js

const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    drivingLicense: { type: String, required: true },
    password: { type: String, required: true },
    vehicleModel: { type: String, required: true },
    location:{ type : String},
    available: { type: Boolean, default: true },
    acceptedRides: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Request' }]
});

const Driver = mongoose.model('Driver', driverSchema);

module.exports = Driver;