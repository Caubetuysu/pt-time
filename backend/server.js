const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// --- Firebase Firestore Database Connection ---
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

let useFirebase = false;
let firestoreDb;

if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: FIREBASE_PROJECT_ID,
                clientEmail: FIREBASE_CLIENT_EMAIL,
                privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        });
        firestoreDb = admin.firestore();
        console.log('Successfully connected to Firebase Firestore');
        useFirebase = true;
    } catch (error) {
        console.error('Error initializing Firebase Admin SDK:', error);
    }
}


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
app.get('/api/subjects', async (req, res) => {
    if (useFirebase) {
        try {
            const snapshot = await firestoreDb.collection('subjects').get();
            if (snapshot.empty) {
                const defaultNames = ["Toán", "Văn", "Anh", "Code", "IELTS"];
                const batch = firestoreDb.batch();
                defaultNames.forEach(name => {
                    const docRef = firestoreDb.collection('subjects').doc(name);
                    batch.set(docRef, { name });
                });
                await batch.commit();
                return res.json(defaultNames);
            }
            const subjects = [];
            snapshot.forEach(doc => {
                subjects.push(doc.data().name);
            });
            res.json(subjects);
        } catch (error) {
            console.error('Error fetching subjects from Firebase:', error);
            res.status(500).json({ error: 'Lỗi truy xuất cơ sở dữ liệu.' });
        }
    } else {
        const db = readDB();
        res.json(db.subjects);
    }
});

// Add a new subject
app.post('/api/subjects', async (req, res) => {
    const { subject } = req.body;
    if (!subject) {
        return res.status(400).json({ error: 'Tên môn học không được bỏ trống.' });
    }
    
    const cleanSubject = subject.trim();
    
    if (useFirebase) {
        try {
            const docRef = firestoreDb.collection('subjects').doc(cleanSubject);
            const doc = await docRef.get();
            if (doc.exists) {
                return res.status(400).json({ error: 'Môn học đã tồn tại.' });
            }
            await docRef.set({ name: cleanSubject });
            
            const snapshot = await firestoreDb.collection('subjects').get();
            const subjects = [];
            snapshot.forEach(d => subjects.push(d.data().name));
            res.status(201).json(subjects);
        } catch (error) {
            console.error('Error saving subject to Firebase:', error);
            res.status(500).json({ error: 'Lỗi khi lưu môn học.' });
        }
    } else {
        const db = readDB();
        if (db.subjects.includes(cleanSubject)) {
            return res.status(400).json({ error: 'Môn học đã tồn tại.' });
        }
        db.subjects.push(cleanSubject);
        if (writeDB(db)) {
            res.status(201).json(db.subjects);
        } else {
            res.status(500).json({ error: 'Không thể lưu môn học mới.' });
        }
    }
});

// Get all logged sessions
app.get('/api/sessions', async (req, res) => {
    if (useFirebase) {
        try {
            const snapshot = await firestoreDb.collection('sessions')
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();
            const sessions = [];
            snapshot.forEach(doc => {
                sessions.push(doc.data());
            });
            res.json(sessions);
        } catch (error) {
            console.error('Error fetching sessions from Firebase:', error);
            res.status(500).json({ error: 'Lỗi truy xuất lịch sử học tập.' });
        }
    } else {
        const db = readDB();
        res.json(db.sessions);
    }
});

// Save a new focus session
app.post('/api/sessions', async (req, res) => {
    const session = req.body;
    if (!session || !session.subject || !session.duration) {
        return res.status(400).json({ error: 'Dữ liệu phiên học không hợp lệ.' });
    }
    
    const newSession = {
        id: session.id || Date.now().toString(),
        subject: session.subject,
        duration: parseInt(session.duration),
        mode: session.mode || 'focus',
        timestamp: session.timestamp || new Date().toISOString()
    };
    
    if (useFirebase) {
        try {
            await firestoreDb.collection('sessions').doc(newSession.id).set(newSession);
            res.status(201).json(newSession);
        } catch (error) {
            console.error('Error saving session to Firebase:', error);
            res.status(500).json({ error: 'Lỗi khi lưu phiên học.' });
        }
    } else {
        const db = readDB();
        db.sessions.push(newSession);
        
        if (writeDB(db)) {
            res.status(201).json(newSession);
        } else {
            res.status(500).json({ error: 'Không thể lưu phiên học.' });
        }
    }
});

// Delete all sessions logs
app.delete('/api/sessions', async (req, res) => {
    if (useFirebase) {
        try {
            const snapshot = await firestoreDb.collection('sessions').get();
            const batch = firestoreDb.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            res.json({ message: 'Đã xóa toàn bộ lịch sử thành công.' });
        } catch (error) {
            console.error('Error deleting sessions from Firebase:', error);
            res.status(500).json({ error: 'Không thể xóa lịch sử.' });
        }
    } else {
        const db = readDB();
        db.sessions = [];
        
        if (writeDB(db)) {
            res.json({ message: 'Đã xóa toàn bộ lịch sử thành công.' });
        } else {
            res.status(500).json({ error: 'Không thể xóa lịch sử.' });
        }
    }
});

// Serve static assets from frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Fallback to index.html for other requests
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Start Server
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`ZenTime API server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
