const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Ayarlar ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Klasörleri oluştur
const uploadsDir = path.join(__dirname, 'uploads');
const avatarsDir = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'azrail-tools-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(flash());

// Global değişkenler
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// --- Kimlik doğrulama middleware ---
function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Bu işlem için giriş yapmalısınız.');
    return res.redirect('/login');
  }
  next();
}

// --- Yardımcı: avatar dosya adı ---
function avatarFilename(userId, originalname) {
  const ext = path.extname(originalname) || '.png';
  return `avatar_${userId}${ext}`;
}

// --- Rotalar ---

// Ana sayfa
app.get('/', (req, res) => {
  const tools = db.getTools().map(t => {
    const u = db.getUserById(t.user_id);
    return { ...t, username: u ? u.username : 'Bilinmeyen', avatar: u ? u.avatar : null };
  });
  res.render('index', { tools, title: 'Anasayfa' });
});

// Giriş
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Giriş Yap' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.getUserByUsername(username);

  if (!user) {
    req.flash('error', 'Kullanıcı adı veya şifre hatalı.');
    return res.redirect('/login');
  }

  const match = bcrypt.compareSync(password, user.password);
  if (!match) {
    req.flash('error', 'Kullanıcı adı veya şifre hatalı.');
    return res.redirect('/login');
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar
  };

  req.flash('success', 'Hoş geldiniz, ' + user.username + '!');
  res.redirect('/');
});

// Kayıt
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { title: 'Kayıt Ol' });
});

app.post('/register', (req, res) => {
  const { username, email, password, password2 } = req.body;
  let errors = [];

  if (!username || !email || !password || !password2) {
    errors.push('Tüm alanları doldurun.');
  }
  if (password !== password2) {
    errors.push('Şifreler eşleşmiyor.');
  }
  if (password && password.length < 6) {
    errors.push('Şifre en az 6 karakter olmalı.');
  }

  if (errors.length > 0) {
    errors.forEach(e => req.flash('error', e));
    return res.redirect('/register');
  }

  const existing = db.getUserByUsername(username) || db.users.find(u => u.email === email);
  if (existing) {
    req.flash('error', 'Bu kullanıcı adı veya e-posta zaten kayıtlı.');
    return res.redirect('/register');
  }

  const hash = bcrypt.hashSync(password, 10);
  db.addUser({
    id: Date.now(),
    username,
    email,
    password: hash,
    avatar: null,
    created_at: new Date().toISOString()
  });

  req.flash('success', 'Kayıt başarılı! Giriş yapabilirsiniz.');
  res.redirect('/login');
});

// Çıkış
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Tool listesi
app.get('/tools', (req, res) => {
  const tools = db.getTools().map(t => {
    const u = db.getUserById(t.user_id);
    return { ...t, username: u ? u.username : 'Bilinmeyen', avatar: u ? u.avatar : null };
  });
  res.render('tools', { tools, title: 'Tüm Tools' });
});

// Tool yükleme sayfası
app.get('/upload', requireAuth, (req, res) => {
  res.render('upload', { title: 'Tool Paylaş' });
});

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, true)
});

app.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Lütfen bir dosya seçin.');
    return res.redirect('/upload');
  }

  const { title, description } = req.body;
  if (!title) {
    req.flash('error', 'Tool başlığı gerekli.');
    return res.redirect('/upload');
  }

  db.addTool({
    id: Date.now(),
    user_id: req.session.user.id,
    title,
    description: description || '',
    filename: req.file.filename,
    original_name: req.file.originalname,
    downloads: 0,
    created_at: new Date().toISOString()
  });

  req.flash('success', 'Tool başarıyla paylaşıldı!');
  res.redirect('/dashboard');
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
  const tools = db.getUserTools(req.session.user.id);
  const user = db.getUserById(req.session.user.id);
  res.render('dashboard', { tools, user, title: 'Profilim' });
});

// Profil sayfası (kendi profil)
app.get('/profile', requireAuth, (req, res) => {
  const user = db.getUserById(req.session.user.id);
  const tools = db.getUserTools(req.session.user.id);
  res.render('profile', { user, tools, title: 'Profil' });
});

// Profil fotoğrafı yükleme
const avatarUpload = multer({
  dest: avatarsDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Sadece resim dosyası yüklenebilir.'));
  }
});

app.post('/profile/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) {
    req.flash('error', 'Lütfen bir resim seçin.');
    return res.redirect('/profile');
  }

  const oldUser = db.getUserById(req.session.user.id);
  if (oldUser.avatar) {
    const oldPath = path.join(avatarsDir, oldUser.avatar);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const fileName = avatarFilename(req.session.user.id, req.file.originalname);
  fs.renameSync(req.file.path, path.join(avatarsDir, fileName));

  db.updateUser(req.session.user.id, { avatar: fileName });

  // Session'ı güncelle
  req.session.user.avatar = fileName;

  req.flash('success', 'Profil fotoğrafınız güncellendi!');
  res.redirect('/profile');
});

// Profil düzenleme (isim/email)
app.post('/profile/edit', requireAuth, (req, res) => {
  const { username, email } = req.body;
  const user = db.getUserById(req.session.user.id);

  if (username && username !== user.username) {
    if (db.getUserByUsername(username)) {
      req.flash('error', 'Bu kullanıcı adı zaten kullanılıyor.');
      return res.redirect('/profile');
    }
  }

  db.updateUser(req.session.user.id, { username: username || user.username, email: email || user.email });

  const updated = db.getUserById(req.session.user.id);
  req.session.user.username = updated.username;
  req.session.user.email = updated.email;

  req.flash('success', 'Profiliniz güncellendi.');
  res.redirect('/profile');
});

// Tool indirme
app.get('/download/:id', (req, res) => {
  const tool = db.getToolById(Number(req.params.id));
  if (!tool) {
    req.flash('error', 'Tool bulunamadı.');
    return res.redirect('/tools');
  }

  const filePath = path.join(uploadsDir, tool.filename);
  if (!fs.existsSync(filePath)) {
    req.flash('error', 'Dosya sunucuda bulunamadı.');
    return res.redirect('/tools');
  }

  db.incrementDownloads(tool.id);
  res.download(filePath, tool.original_name);
});

// Tool silme
app.post('/tools/:id/delete', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const tool = db.getToolById(id);
  if (!tool) {
    req.flash('error', 'Tool bulunamadı.');
    return res.redirect('/dashboard');
  }
  if (tool.user_id !== req.session.user.id) {
    req.flash('error', 'Bu aracı silme yetkiniz yok.');
    return res.redirect('/dashboard');
  }

  const filePath = path.join(uploadsDir, tool.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.deleteTool(id, req.session.user.id);
  req.flash('success', 'Tool silindi.');
  res.redirect('/dashboard');
});

// --- Sunucu başlat ---
app.listen(PORT, () => {
  console.log(`Azrail Tools sunucusu çalışıyor: http://localhost:${PORT}`);
});
