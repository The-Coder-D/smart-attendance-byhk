const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    teacherId: { type: String, required: true },
    course: { type: String, required: true },
    subject: { type: String, required: true },
    qrData: { type: String }, // The hidden data inside the QR
    sessionCode: { type: String }, // The 6-digit manual pin
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now, expires: 600 }
});

module.exports = mongoose.model('Session', sessionSchema);