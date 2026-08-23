import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

// ---- in-memory "database" ----
const users = new Map();        // email -> { id, password }
const sessions = new Map();     // sessionId -> userId
const notes = new Map();        // id -> { id, userId, title, content }
let nextId = 1;

function auth(req, res, next) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/sid=([\w-]+)/);
  const userId = match && sessions.get(match[1]);
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  req.userId = userId;
  next();
}

// ---- auth ----
app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  if (users.has(email)) return res.status(400).json({ error: "email already registered" });
  const id = String(nextId++);
  users.set(email, { id, password });
  const sid = crypto.randomUUID();
  sessions.set(sid, id);
  res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly`);
  res.json({ id, email, sid });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password) return res.status(401).json({ error: "Invalid credentials" });
  const sid = crypto.randomUUID();
  sessions.set(sid, user.id);
  res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly`);
  res.json({ id: user.id, email, sid });
});

// ---- notes ----
app.get("/api/notes", (req, res) => {
  const list = [...notes.values()].map(n => ({
    id: n.id,
    title: n.title,
    content: n.content
  }));
  res.json(list);
});

app.post("/api/notes", auth, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: "title and content required" });
  const id = String(nextId++);
  const note = { id, userId: req.userId, title, content };
  notes.set(id, note);
  res.json({ id, title, content });
});

app.delete("/api/notes/:id", auth, (req, res) => {
  const note = notes.get(req.params.id);
  if (!note || note.userId !== req.userId) return res.status(403).json({ error: "forbidden" });
  notes.delete(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

const PORT = 4100;
app.listen(PORT, () => console.log(`Notes backend running on http://localhost:${PORT}`));
