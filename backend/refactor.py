import re
import os

filepath = r"c:\Users\Administrator\OneDrive\Desktop\PT TIME\backend\server.js"

with open(filepath, 'r', encoding='utf8') as f:
    content = f.read()

# 1. Add Middleware and getUserDB
middleware = """
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
"""
content = content.replace("// API Endpoints\n", middleware)

# 2. Replace Firestore calls
content = content.replace("firestoreDb.collection('subjects')", "firestoreDb.collection('users').doc(req.user.uid).collection('subjects')")
content = content.replace("firestoreDb.collection('sessions')", "firestoreDb.collection('users').doc(req.user.uid).collection('sessions')")
content = content.replace("firestoreDb.collection('documents')", "firestoreDb.collection('users').doc(req.user.uid).collection('documents')")
content = content.replace("firestoreDb.collection('courses')", "firestoreDb.collection('users').doc(req.user.uid).collection('courses')")

# 3. Replace local DB calls in endpoints
# Find all occurrences of "const db = readDB();" inside endpoints and replace
content = content.replace("const db = readDB();", "const db = readDB();\n        const userDb = getUserDB(db, req.user.uid);")

# Replace db.subjects -> userDb.subjects
content = re.sub(r'db\.subjects', 'userDb.subjects', content)
content = re.sub(r'db\.sessions', 'userDb.sessions', content)
content = re.sub(r'db\.documents', 'userDb.documents', content)
content = re.sub(r'db\.courses', 'userDb.courses', content)

with open(filepath, 'w', encoding='utf8') as f:
    f.write(content)

print("Refactored server.js")
