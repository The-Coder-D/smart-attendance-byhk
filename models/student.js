const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    erpId: { type: String, required: true, unique: true },
    branch: { type: String, required: true },
    batch: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    password: { type: String, default: 'password123' } // Default ERP password
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);


