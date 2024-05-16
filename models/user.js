const mongoose = require('mongoose');
const passportlocalmongoose = require('passport-local-mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    email:{
        type:String,
        required:[true,'Email Is Neccesary'],
        unique:true
    },
    requestRide: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Request' // Reference to the Request model
    }
})
userSchema.plugin(passportlocalmongoose);

module.exports = mongoose.model('User',userSchema);