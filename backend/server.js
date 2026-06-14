const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to read DB
function readDB() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            // Re-create default DB if missing
            const defaultDB = {
                subjects: ["Toán", "Văn", "Anh", "Code", "IELTS"],
                sessions: []
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2), 'utf8');
            return defaultDB;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database file:', error);
        return {
            subjects: ["Toán", "Văn", "Anh", "Code", "IELTS"],
            sessions: []
        };
    }
}

// Helper function to write DB
function writeDB(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Error writing database file:', error);
        return false;
    }
}

// API Endpoints

// Get all subjects
app.get('/api/subjects', (req, res) => {
    const db = readDB();
    res.json(db.subjects);
});

// Add a new subject
app.post('/api/subjects', (req, res) => {
    const { subject } = req.body;
    if (!subject) {
        return res.status(400).json({ error: 'Tên môn học không được bỏ trống.' });
    }
    
    const db = readDB();
    const cleanSubject = subject.trim();
    
    if (db.subjects.includes(cleanSubject)) {
        return res.status(400).json({ error: 'Môn học đã tồn tại.' });
    }
    
    db.subjects.push(cleanSubject);
    if (writeDB(db)) {
        res.status(201).json(db.subjects);
    } else {
        res.status(500).json({ error: 'Không thể lưu môn học mới.' });
    }
});

// Get all logged sessions
app.get('/api/sessions', (req, res) => {
    const db = readDB();
    res.json(db.sessions);
});

// Save a new focus session
app.post('/api/sessions', (req, res) => {
    const session = req.body;
    if (!session || !session.subject || !session.duration) {
        return res.status(400).json({ error: 'Dữ liệu phiên học không hợp lệ.' });
    }
    
    const db = readDB();
    const newSession = {
        id: session.id || Date.now().toString(),
        subject: session.subject,
        duration: parseInt(session.duration),
        mode: session.mode || 'focus',
        timestamp: session.timestamp || new Date().toISOString()
    };
    
    db.sessions.push(newSession);
    
    if (writeDB(db)) {
        res.status(201).json(newSession);
    } else {
        res.status(500).json({ error: 'Không thể lưu phiên học.' });
    }
});

// Delete all sessions logs
app.delete('/api/sessions', (req, res) => {
    const db = readDB();
    db.sessions = [];
    
    if (writeDB(db)) {
        res.json({ message: 'Đã xóa toàn bộ lịch sử thành công.' });
    } else {
        res.status(500).json({ error: 'Không thể xóa lịch sử.' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`ZenTime API server is running on http://localhost:${PORT}`);
});
