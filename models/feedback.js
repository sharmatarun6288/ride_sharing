const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
    username:{
        type:String
    },
    feedback:{
        type:String
    }
})

module.exports = mongoose.model('Feedback',FeedbackSchema);