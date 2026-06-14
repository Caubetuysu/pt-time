const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(filepath, 'utf8');

const middleware = `
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
`;

content = content.replace("// API Endpoints\n", middleware);

content = content.replaceAll("firestoreDb.collection('subjects')", "firestoreDb.collection('users').doc(req.user.uid).collection('subjects')");
content = content.replaceAll("firestoreDb.collection('sessions')", "firestoreDb.collection('users').doc(req.user.uid).collection('sessions')");
content = content.replaceAll("firestoreDb.collection('documents')", "firestoreDb.collection('users').doc(req.user.uid).collection('documents')");
content = content.replaceAll("firestoreDb.collection('courses')", "firestoreDb.collection('users').doc(req.user.uid).collection('courses')");

content = content.replaceAll("const db = readDB();", "const db = readDB();\n        const userDb = getUserDB(db, req.user.uid);");

content = content.replaceAll("db.subjects", "userDb.subjects");
content = content.replaceAll("db.sessions", "userDb.sessions");
content = content.replaceAll("db.documents", "userDb.documents");
content = content.replaceAll("db.courses", "userDb.courses");

// Wait! In writeDB(db), we must pass `db` not `userDb.users`. But my replace above changed `writeDB(db)` to `writeDB(userDb)`? No, it only replaced `db.subjects`.

fs.writeFileSync(filepath, content, 'utf8');
console.log("Refactored server.js");
