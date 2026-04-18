require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const qrcode = require('qrcode');
const Attendance = require('./models/attendence');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        createDefaultTeacher(); // Create a teacher account if none exists
    })
    .catch((err) => console.error('❌ MongoDB connection error:', err));

// Import Models
const Student = require('./models/student');
const Teacher = require('./models/teacher');
const Session = require('./models/session');

// --- API ROUTES ---

// 1. Teacher Login Route
app.post('/api/teacher-login', async (req, res) => {
    try {
        const { teacherId, password } = req.body;
        
        // MASTER KEY FOR TESTING
        if (teacherId === "test" && password === "1234") {
            return res.json({ success: true, teacherName: "Teacher" });
        }

        // Normal database check
        const teacher = await Teacher.findOne({ teacherId, password });
        
        if (teacher) {
            res.json({ success: true, teacherName: teacher.fullName });
        } else {
            res.status(401).json({ success: false, message: "Invalid ID or Password" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error during login." });
    }
});

// 2. Add Student Route
app.post('/api/add-student', async (req, res) => {
    try {
        const newStudent = new Student(req.body);
        await newStudent.save();
        res.status(201).json({ success: true, message: "Student Registered Successfully in MongoDB!" });
    } catch (error) {
        if(error.code === 11000) {
            res.status(400).json({ success: false, message: "ERP ID already exists!" });
        } else {
            res.status(500).json({ success: false, message: "Server Error", error });
        }
    }
});

// 3. Create Session & Generate QR Code
app.post('/api/create-session', async (req, res) => {
    try {
        const { teacherId, course, subject } = req.body;
        
        // Generate a random 6-digit pin for students without cameras
        const sessionCode = Math.floor(100000 + Math.random() * 900000).toString();

        const newSession = new Session({ teacherId, course, subject, sessionCode });
        await newSession.save();

        // Convert the secure MongoDB Session ID into a visual QR Code Image!
        const qrDataUrl = await qrcode.toDataURL(newSession._id.toString());

        res.json({ 
            success: true, 
            qrImage: qrDataUrl, 
            sessionCode: sessionCode,
            sessionId: newSession._id 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to generate session." });
    }
});

// Fetch live attendance for a specific session ID
app.get('/api/live-session-attendance/:sessionId', async (req, res) => {
    try {
        const attendances = await Attendance.find({ sessionId: req.params.sessionId }).sort({ createdAt: -1 });
        res.json({ success: true, attendances });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// 4. Mark Attendance (Via QR Scan or Manual Pin)
app.post('/api/mark-attendance', async (req, res) => {
    try {
        const { erpId, sessionIdentifier } = req.body; // identifier is either the 6-digit pin OR the QR code text

        // 1. Verify Student Exists
        const student = await Student.findOne({ erpId });
        if (!student) return res.status(404).json({ success: false, message: "Student ERP ID not found." });

        // 2. Verify Session Exists and is Active
        let session;
        if (sessionIdentifier.length === 6) {
            session = await Session.findOne({ sessionCode: sessionIdentifier, isActive: true });
        } else {
            session = await Session.findById(sessionIdentifier); // If they scanned the QR
        }

        if (!session || !session.isActive) {
            return res.status(404).json({ success: false, message: "Invalid or Expired Session Code." });
        }

        // 3. Check if they already marked attendance today to prevent duplicates
        const existing = await Attendance.findOne({ studentErpId: erpId, sessionId: session._id });
        if (existing) {
            return res.status(400).json({ success: false, message: "Attendance already marked for this lecture!" });
        }

        // 4. Save to Database!
        await Attendance.create({ 
            studentErpId: erpId, 
            sessionId: session._id,
            subject: session.subject 
        });

        res.json({ success: true, message: `Attendance successfully recorded for ${student.fullName}!` });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error processing attendance." });
    }
});

// 5. Fetch Student Attendance Dashboard Data
app.get('/api/get-attendance/:erpId', async (req, res) => {
    try {
        const erpId = req.params.erpId;

        // 1. Verify Student
        const student = await Student.findOne({ erpId });
        if (!student) return res.status(404).json({ success: false, message: "Student not found." });

        // 2. Fetch all their attendance records, sorted by newest first
        const records = await Attendance.find({ studentErpId: erpId }).sort({ createdAt: -1 });

        // 3. Calculate basic overall percentage (Mock logic for now: assume 75% base + recent attendance)
        // In a real app, you'd divide records by total sessions held.
        let basePercentage = 75; 
        let currentPercentage = Math.min(100, basePercentage + (records.length * 2)); 

        res.json({ 
            success: true, 
            studentName: student.fullName,
            percentage: currentPercentage,
            recentRecords: records 
        });

    } catch (error) {
        res.status(500).json({ success: false, message: "Server error fetching attendance." });
    }
});

// Fetch Real System Activity
app.get('/api/recent-activity', async (req, res) => {
    try {
        // Find the 5 newest attendance records
        const recentScans = await Attendance.find().sort({ createdAt: -1 }).limit(5);
        res.json({ success: true, activities: recentScans });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// 6. Get Total Student Count
app.get('/api/student-count', async (req, res) => {
    try {
        const count = await Student.countDocuments();
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// 7. Bulk Add Students via CSV
app.post('/api/bulk-add-students', async (req, res) => {
    try {
        const students = req.body.students;
        
        if (!students || students.length === 0) {
            return res.status(400).json({ success: false, message: "No data received." });
        }

        // insertMany automatically adds the whole array to the database
        // { ordered: false } tells MongoDB to keep going even if it finds a duplicate ERP ID
        await Student.insertMany(students, { ordered: false }); 
        
        res.json({ success: true, message: `Successfully processed ${students.length} students!` });
    } catch (error) {
        // Code 11000 is MongoDB's error for duplicate unique keys (like ERP IDs)
        if (error.code === 11000) {
            res.status(200).json({ success: true, message: "Upload complete, but some duplicate ERP IDs were skipped." });
        } else {
            res.status(500).json({ success: false, message: "Server error during bulk upload." });
        }
    }
});

// Fallback route for frontend UI
// Fallback route for frontend UI (Updated for Express 5)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to create a test teacher
async function createDefaultTeacher() {
    const teacherCount = await Teacher.countDocuments();
    if (teacherCount === 0) {
        await Teacher.create({
            facultyId: 'FAC-001',
            password: 'admin',
            name: 'Prof. Shriram Hatwar'
        });
        console.log('👨‍🏫 Default Teacher Created (ID: FAC-001 | Pass: admin)');
    }
}

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});