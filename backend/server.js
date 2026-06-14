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
                sessions: [],
                documents: [],
                courses: []
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2), 'utf8');
            return defaultDB;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(data);
        if (!parsed.documents) parsed.documents = [];
        if (!parsed.courses) parsed.courses = [];
        return parsed;
    } catch (error) {
        console.error('Error reading database file:', error);
        return {
            subjects: ["Toán", "Văn", "Anh", "Code", "IELTS"],
            sessions: [],
            documents: [],
            courses: []
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


// --- Auth Middleware ---
const authenticateUser = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.user = { uid: 'guest' };
        return next();
    }
    const token = authHeader.split('Bearer ')[1];
    if (useFirebase && token) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
        } catch (error) {
            console.error('Error verifying Firebase token:', error);
            req.user = { uid: 'guest' };
        }
    } else if (token && token !== 'null') {
        try {
            // Decode JWT payload manually (for local db.json without admin credentials)
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            req.user = { uid: payload.user_id || payload.sub || 'guest' };
        } catch (e) {
            req.user = { uid: 'guest' };
        }
    } else {
        req.user = { uid: 'guest' };
    }
    next();
};

app.use(authenticateUser);

function getUserDB(db, uid) {
    if (!db.users) db.users = {};
    if (!db.users[uid]) {
        db.users[uid] = {
            subjects: ["Toán", "Văn", "Anh", "Code", "IELTS"],
            sessions: [],
            documents: [],
            courses: []
        };
    }
    return db.users[uid];
}

// API Endpoints

// Get all subjects
app.get('/api/subjects', async (req, res) => {
    if (useFirebase) {
        try {
            const snapshot = await firestoreDb.collection('users').doc(req.user.uid).collection('subjects').get();
            if (snapshot.empty) {
                const defaultNames = ["Toán", "Văn", "Anh", "Code", "IELTS"];
                const batch = firestoreDb.batch();
                defaultNames.forEach(name => {
                    const docRef = firestoreDb.collection('users').doc(req.user.uid).collection('subjects').doc(name);
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
        const userDb = getUserDB(db, req.user.uid);
        res.json(userDb.subjects);
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
            const docRef = firestoreDb.collection('users').doc(req.user.uid).collection('subjects').doc(cleanSubject);
            const doc = await docRef.get();
            if (doc.exists) {
                return res.status(400).json({ error: 'Môn học đã tồn tại.' });
            }
            await docRef.set({ name: cleanSubject });
            
            const snapshot = await firestoreDb.collection('users').doc(req.user.uid).collection('subjects').get();
            const subjects = [];
            snapshot.forEach(d => subjects.push(d.data().name));
            res.status(201).json(subjects);
        } catch (error) {
            console.error('Error saving subject to Firebase:', error);
            res.status(500).json({ error: 'Lỗi khi lưu môn học.' });
        }
    } else {
        const db = readDB();
        const userDb = getUserDB(db, req.user.uid);
        if (userDb.subjects.includes(cleanSubject)) {
            return res.status(400).json({ error: 'Môn học đã tồn tại.' });
        }
        userDb.subjects.push(cleanSubject);
        if (writeDB(db)) {
            res.status(201).json(userDb.subjects);
        } else {
            res.status(500).json({ error: 'Không thể lưu môn học mới.' });
        }
    }
});

// Get all logged sessions
app.get('/api/sessions', async (req, res) => {
    if (useFirebase) {
        try {
            const snapshot = await firestoreDb.collection('users').doc(req.user.uid).collection('sessions')
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
        const userDb = getUserDB(db, req.user.uid);
        res.json(userDb.sessions);
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
            await firestoreDb.collection('users').doc(req.user.uid).collection('sessions').doc(newSession.id).set(newSession);
            res.status(201).json(newSession);
        } catch (error) {
            console.error('Error saving session to Firebase:', error);
            res.status(500).json({ error: 'Lỗi khi lưu phiên học.' });
        }
    } else {
        const db = readDB();
        const userDb = getUserDB(db, req.user.uid);
        userDb.sessions.push(newSession);
        
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
            const snapshot = await firestoreDb.collection('users').doc(req.user.uid).collection('sessions').get();
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
        const userDb = getUserDB(db, req.user.uid);
        userDb.sessions = [];
        
        if (writeDB(db)) {
            res.json({ message: 'Đã xóa toàn bộ lịch sử thành công.' });
        } else {
            res.status(500).json({ error: 'Không thể xóa lịch sử.' });
        }
    }
});

// --- Documents API Endpoints ---
app.get('/api/documents', async (req, res) => {
    if (useFirebase) {
        try {
            const snapshot = await firestoreDb.collection('users').doc(req.user.uid).collection('documents').get();
            const docs = [];
            snapshot.forEach(doc => {
                docs.push(doc.data());
            });
            res.json(docs);
        } catch (error) {
            console.error('Error fetching documents from Firebase:', error);
            res.status(500).json({ error: 'Lỗi truy xuất danh sách tài liệu.' });
        }
    } else {
        const db = readDB();
        const userDb = getUserDB(db, req.user.uid);
        res.json(userDb.documents || []);
    }
});

app.post('/api/documents', async (req, res) => {
    const docItem = req.body;
    if (!docItem || !docItem.title || !docItem.url) {
        return res.status(400).json({ error: 'Thông tin tài liệu không hợp lệ.' });
    }
    
    const newDoc = {
        id: docItem.id || Date.now().toString(),
        title: docItem.title.trim(),
        category: docItem.category || 'Khác',
        url: docItem.url.trim(),
        timestamp: docItem.timestamp || new Date().toISOString()
    };
    
    if (useFirebase) {
        try {
            await firestoreDb.collection('users').doc(req.user.uid).collection('documents').doc(newDoc.id).set(newDoc);
            res.status(201).json(newDoc);
        } catch (error) {
            console.error('Error saving document to Firebase:', error);
            res.status(500).json({ error: 'Lỗi khi lưu tài liệu mới.' });
        }
    } else {
        const db = readDB();
        const userDb = getUserDB(db, req.user.uid);
        if (!userDb.documents) userDb.documents = [];
        userDb.documents.push(newDoc);
        if (writeDB(db)) {
            res.status(201).json(newDoc);
        } else {
            res.status(500).json({ error: 'Không thể lưu tài liệu mới.' });
        }
    }
});

// --- Courses API Endpoints ---
app.get('/api/courses', async (req, res) => {
    if (useFirebase) {
        try {
            const snapshot = await firestoreDb.collection('users').doc(req.user.uid).collection('courses').get();
            const courses = [];
            snapshot.forEach(doc => {
                courses.push(doc.data());
            });
            res.json(courses);
        } catch (error) {
            console.error('Error fetching courses from Firebase:', error);
            res.status(500).json({ error: 'Lỗi truy xuất danh sách khóa học.' });
        }
    } else {
        const db = readDB();
        const userDb = getUserDB(db, req.user.uid);
        res.json(userDb.courses || []);
    }
});

app.post('/api/courses', async (req, res) => {
    const courseItem = req.body;
    if (!courseItem || !courseItem.title) {
        return res.status(400).json({ error: 'Thông tin khóa học không hợp lệ.' });
    }
    
    const newCourse = {
        id: courseItem.id || Date.now().toString(),
        title: courseItem.title.trim(),
        teacher: courseItem.teacher || 'Tự học',
        playlistId: courseItem.playlistId || '',
        videoCount: parseInt(courseItem.videoCount) || 1,
        completedVideos: courseItem.completedVideos || [],
        currentVideoIndex: parseInt(courseItem.currentVideoIndex) || 0,
        timestamp: courseItem.timestamp || new Date().toISOString()
    };
    
    if (useFirebase) {
        try {
            await firestoreDb.collection('users').doc(req.user.uid).collection('courses').doc(newCourse.id).set(newCourse);
            res.status(201).json(newCourse);
        } catch (error) {
            console.error('Error saving course to Firebase:', error);
            res.status(500).json({ error: 'Lỗi khi lưu khóa học mới.' });
        }
    } else {
        const db = readDB();
        const userDb = getUserDB(db, req.user.uid);
        if (!userDb.courses) userDb.courses = [];
        userDb.courses.push(newCourse);
        if (writeDB(db)) {
            res.status(201).json(newCourse);
        } else {
            res.status(500).json({ error: 'Không thể lưu khóa học mới.' });
        }
    }
});

app.post('/api/courses/progress', async (req, res) => {
    const { id, completedVideos, currentVideoIndex } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'Thiếu ID khóa học.' });
    }
    
    if (useFirebase) {
        try {
            const docRef = firestoreDb.collection('users').doc(req.user.uid).collection('courses').doc(id);
            const doc = await docRef.get();
            if (!doc.exists) {
                return res.status(404).json({ error: 'Không tìm thấy khóa học.' });
            }
            
            await docRef.update({
                completedVideos: completedVideos || [],
                currentVideoIndex: parseInt(currentVideoIndex) || 0
            });
            
            const updated = await docRef.get();
            res.json(updated.data());
        } catch (error) {
            console.error('Error updating course progress in Firebase:', error);
            res.status(500).json({ error: 'Lỗi khi cập nhật tiến độ học.' });
        }
    } else {
        const db = readDB();
        const userDb = getUserDB(db, req.user.uid);
        if (!userDb.courses) userDb.courses = [];
        const index = userDb.courses.findIndex(c => c.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Không tìm thấy khóa học.' });
        }
        
        userDb.courses[index].completedVideos = completedVideos || [];
        userDb.courses[index].currentVideoIndex = parseInt(currentVideoIndex) || 0;
        
        if (writeDB(db)) {
            res.json(userDb.courses[index]);
        } else {
            res.status(500).json({ error: 'Không thể cập nhật tiến độ học.' });
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
        console.log(`PT Time API server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
