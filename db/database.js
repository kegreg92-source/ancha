const fs = require('fs');
const path = require('path');

const AVATARS_DIR = path.join(__dirname, '..', 'public', 'avatars');
const USERS_FILE = path.join(__dirname, 'users.json');
const TOOLS_FILE = path.join(__dirname, 'tools.json');

if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

function readJSON(file, def) {
  if (!fs.existsSync(file)) return def;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return def;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const db = {
  users: readJSON(USERS_FILE, []),
  tools: readJSON(TOOLS_FILE, []),

  save() {
    writeJSON(USERS_FILE, this.users);
    writeJSON(TOOLS_FILE, this.tools);
  },

  // --- Kullanıcılar ---
  getUserByUsername(username) {
    return this.users.find(u => u.username === username);
  },
  getUserById(id) {
    return this.users.find(u => u.id === id);
  },
  addUser(user) {
    this.users.push(user);
    this.save();
    return user;
  },
  updateUser(id, updates) {
    const idx = this.users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    this.users[idx] = { ...this.users[idx], ...updates };
    this.save();
    return this.users[idx];
  },

  // --- Tool'lar ---
  getTools() {
    return [...this.tools]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  getUserTools(userId) {
    return this.getTools().filter(t => t.user_id === userId);
  },
  getToolById(id) {
    return this.tools.find(t => t.id === id);
  },
  addTool(tool) {
    this.tools.push(tool);
    this.save();
    return tool;
  },
  deleteTool(id, userId) {
    const idx = this.tools.findIndex(t => t.id === id && t.user_id === userId);
    if (idx === -1) return false;
    const removed = this.tools.splice(idx, 1)[0];
    this.save();
    return removed;
  },
  incrementDownloads(id) {
    const t = this.tools.find(x => x.id === id);
    if (t) {
      t.downloads = (t.downloads || 0) + 1;
      this.save();
    }
  }
};

module.exports = db;
