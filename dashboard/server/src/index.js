require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const metrics = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/api', metrics);

// Serve built React client in production
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(PORT, () => console.log(`API server running on http://localhost:${PORT}`));
