const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;
let code = require('./pair'); 

require('events').EventEmitter.defaultMaxListeners = 500;

__path = process.cwd();

// Routes
app.use('/code', code);
app.use('/pair', async (req, res, next) => {
    res.sendFile(path.join(__path, 'pair.html'));
});

// Main page
app.use('/', async (req, res, next) => {
    res.sendFile(path.join(__path, 'main.html'));
});

// Static files
app.use('/assets', express.static(path.join(__path, 'assets')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║     𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 - PASTPAPER BOT     ║
╠══════════════════════════════════════╣
║  🚀 Server: http://localhost:${PORT}     ║
║  📚 Commands: .owner, .alive, .ping, .pastpaper ║
║  👑 Owner: Sandaru                     ║
╚══════════════════════════════════════╝
    `);
});

module.exports = app;