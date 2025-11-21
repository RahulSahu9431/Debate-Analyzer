const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

dotenv.config();

const User = require('./models/User');
const Debate = require('./models/Debate');
const Argument = require('./models/Argument');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Mongo error:', err));

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ---------- AUTH ROUTES ----------

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username & password required' });

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ message: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash });

    res.status(201).json({ message: 'User registered', userId: user._id });
  } catch (err) {
    console.error('Register error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- DEBATE ROUTES ----------

// Create Debate
app.post('/api/debates', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body;
    const debate = await Debate.create({
      title,
      description,
      createdBy: req.user.userId
    });
    res.status(201).json(debate);
  } catch (err) {
    console.error('Create debate error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// List all debates (with simple stats)
// List all debates (with full stats: points, participants, winner)
app.get('/api/debates', authMiddleware, async (req, res) => {
  try {
    const debates = await Debate.find().sort({ createdAt: -1 });

    const debateIds = debates.map(d => d._id);

    const argumentsList = await Argument.find({
      debate: { $in: debateIds }
    });

    // Build stats per debate
    const statsMap = {};

    debates.forEach(d => {
      statsMap[d._id] = {
        for: 0,
        against: 0,
        participants: 0,
        forPoints: 0,
        againstPoints: 0,
        winner: "DRAW",
        participantSet: new Set()
      };
    });

    argumentsList.forEach(arg => {
      const st = statsMap[arg.debate];
      const isLong = arg.text.length >= 120 ? 1 : 0;

      st.participantSet.add(arg.authorName);

      if (arg.side === "for") {
        st.for++;
        st.forPoints += 1 + isLong;
      } else {
        st.against++;
        st.againstPoints += 1 + isLong;
      }
    });

    // Final calculations
    Object.values(statsMap).forEach(st => {
      st.participants = st.participantSet.size;
      delete st.participantSet;

      if (st.forPoints > st.againstPoints) st.winner = "FOR";
      else if (st.againstPoints > st.forPoints) st.winner = "AGAINST";
      else st.winner = "DRAW";
    });

    const result = debates.map(d => ({
      ...d.toObject(),
      stats: statsMap[d._id] || {
        for: 0, against: 0, forPoints: 0, againstPoints: 0,
        participants: 0, winner: "DRAW"
      }
    }));

    res.json(result);

  } catch (err) {
    console.error('List debates error', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// Get single debate with arguments and stats
app.get('/api/debates/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const debate = await Debate.findById(id);
    if (!debate) return res.status(404).json({ message: 'Debate not found' });

    const argumentsList = await Argument.find({ debate: id }).sort({ createdAt: 1 });

    const stats = {
  for: 0,
  against: 0,
  participants: 0,
  forPoints: 0,
  againstPoints: 0,
  winner: "DRAW"
};

const participantsSet = new Set();

argumentsList.forEach(arg => {
  const isLong = arg.text.length >= 120 ? 1 : 0; // bonus point for long arguments

  participantsSet.add(arg.authorName);

  if (arg.side === "for") {
    stats.for++;
    stats.forPoints += 1 + isLong;   // base + length bonus
  } else {
    stats.against++;
    stats.againstPoints += 1 + isLong;
  }
});

stats.participants = participantsSet.size;

// Determine winner
if (stats.forPoints > stats.againstPoints) {
  stats.winner = "FOR";
} else if (stats.againstPoints > stats.forPoints) {
  stats.winner = "AGAINST";
} else {
  stats.winner = "DRAW";
}


    res.json({
      debate,
      arguments: argumentsList,
      stats
    });
  } catch (err) {
    console.error('Get debate error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add argument (For / Against)
app.post('/api/debates/:id/arguments', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { side, text, authorName } = req.body;
    if (!['for', 'against'].includes(side))
      return res.status(400).json({ message: 'Side must be for/against' });

    const debate = await Debate.findById(id);
    if (!debate) return res.status(404).json({ message: 'Debate not found' });

    const arg = await Argument.create({
      debate: id,
      side,
      text,
      authorName: authorName || req.user.username,
      user: req.user.userId
    });

    res.status(201).json(arg);
  } catch (err) {
    console.error('Add argument error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ---------- XML EXPORT ----------

app.get('/api/debates/:id/export-xml', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const debate = await Debate.findById(id);
    if (!debate) return res.status(404).send('Debate not found');

    const argumentsList = await Argument.find({ debate: id }).sort({ createdAt: 1 });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<debate id="${debate._id}">\n`;
    xml += `  <title>${escapeXml(debate.title)}</title>\n`;
    xml += `  <description>${escapeXml(debate.description || '')}</description>\n`;
    xml += `  <arguments>\n`;

    argumentsList.forEach(arg => {
      xml += `    <argument side="${arg.side}" author="${escapeXml(arg.authorName)}">\n`;
      xml += `      <text>${escapeXml(arg.text)}</text>\n`;
      xml += `      <createdAt>${arg.createdAt.toISOString()}</createdAt>\n`;
      xml += `    </argument>\n`;
    });

    xml += `  </arguments>\n`;
    xml += `</debate>\n`;

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Export XML error', err);
    res.status(500).send('Server error');
  }
});

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Fallback: serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
