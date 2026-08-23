import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

// ---- test instrumentation: request counter for idempotency verification ----
// Only registered when NODE_ENV === "test" to prevent test routes in production.
if (process.env.NODE_ENV === "test") {
  let __testCallCount = 0;
  app.use((req, res, next) => {
    if (req.method === "POST" && req.path === "/api/projects") {
      __testCallCount++;
    }
    next();
  });
  app.get("/__test/call-count", (req, res) => {
    res.json({ count: __testCallCount });
  });
  app.post("/__test/reset-count", (req, res) => {
    __testCallCount = 0;
    res.json({ count: 0 });
  });
}

// ---- in-memory "database" ----
const users = new Map();        // email -> { id, password }
const sessions = new Map();     // sessionId -> userId
const projects = new Map();     // id -> { id, userId, name }
const tasks = new Map();        // id -> { id, projectId, title, status, due_date }
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
  res.cookie ? null : res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly`);
  res.json({ id, email, sid }); // sid also returned in body for demo convenience
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

// ---- projects ----
app.get("/api/projects", auth, (req, res) => {
  const list = [...projects.values()]
    .filter(p => p.userId === req.userId)
    .map(p => ({
      id: p.id,
      name: p.name,
      task_count: [...tasks.values()].filter(t => t.projectId === p.id).length,
    }));
  res.json(list);
});

app.post("/api/projects", auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const id = String(nextId++);
  const project = { id, userId: req.userId, name };
  projects.set(id, project);
  res.json({ id, name, task_count: 0 });
});

app.delete("/api/projects/:id", auth, (req, res) => {
  const project = projects.get(req.params.id);
  if (!project || project.userId !== req.userId) return res.status(404).json({ error: "not found" });
  projects.delete(req.params.id);
  for (const [tid, t] of tasks) if (t.projectId === req.params.id) tasks.delete(tid);
  res.status(204).end();
});

// ---- tasks ----
app.get("/api/projects/:id/tasks", auth, (req, res) => {
  const project = projects.get(req.params.id);
  if (!project || project.userId !== req.userId) return res.status(404).json({ error: "not found" });
  let list = [...tasks.values()].filter(t => t.projectId === req.params.id);
  if (req.query.status) list = list.filter(t => t.status === req.query.status);
  res.json(list);
});

app.post("/api/projects/:id/tasks", auth, (req, res) => {
  const project = projects.get(req.params.id);
  if (!project || project.userId !== req.userId) return res.status(404).json({ error: "not found" });
  const { title, due_date } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  const id = String(nextId++);
  const task = { id, projectId: req.params.id, title, status: "todo", due_date: due_date || null };
  tasks.set(id, task);
  res.json(task);
});

app.patch("/api/tasks/:id", auth, (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  const project = projects.get(task.projectId);
  if (!project || project.userId !== req.userId) return res.status(404).json({ error: "not found" });
  Object.assign(task, req.body);
  res.json(task);
});

app.delete("/api/tasks/:id", auth, (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "not found" });
  const project = projects.get(task.projectId);
  if (!project || project.userId !== req.userId) return res.status(404).json({ error: "not found" });
  tasks.delete(req.params.id);
  res.status(204).end();
});

const PORT = process.env.TEST_PORT || 4000;
const server = app.listen(PORT, () => console.log(`Test TaskDeck backend running on http://localhost:${PORT}`));
export { app, server, PORT };
