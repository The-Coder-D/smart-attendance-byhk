// models/Attendance.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    studentErpId: { type: String, required: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    subject: { type: String, required: true },
    status: { type: String, default: 'Present' }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);