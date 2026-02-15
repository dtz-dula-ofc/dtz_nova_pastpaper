const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const cheerio = require('cheerio');
const { Octokit } = require('@octokit/rest');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

// Global cache for pastpaper search results
global.ppSearchCache = {};

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💥', '👍', '😍', '💗', '🎈', '🎉', '🥳', '😎', '🚀', '🔥'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/D4rOaoqGvoU38WT12SegRY',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: './lod-x-free.jpg',
    NEWSLETTER_JID: '120363401755639074@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94759371545',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbAWWH9BFLgRMCXVlU38',
    BOT_NAME_FANCY: '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳'
};

const octokit = new Octokit({ auth: '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' });// ඔයා 𝚐𝚒𝚝𝚑𝚞𝚋 𝚝𝚘𝚔𝚎𝚗 එකක් අරන් ඒක දාන්න
const owner = 'dtz-dula-ofc';//𝚐𝚒𝚝𝚑𝚞𝚋 𝙰𝙲𝙲𝙾𝚄𝙽𝚃 එකේ 𝚞𝚜𝚎𝚗𝚊𝚖𝚎 දාන්න 
const repo = 'dtz_nova_pastpaper';//𝚐𝚒𝚝𝚑𝚞𝚋 𝚁𝙴𝙿𝙾 එකේ නම දාන්න

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}

function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

async function cleanDuplicateFiles(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith(`empire_${sanitizedNumber}_`) && file.name.endsWith('.json')
        ).sort((a, b) => {
            const timeA = parseInt(a.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            const timeB = parseInt(b.name.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            return timeB - timeA;
        });

        const configFiles = data.filter(file => 
            file.name === `config_${sanitizedNumber}.json`
        );

        if (sessionFiles.length > 1) {
            for (let i = 1; i < sessionFiles.length; i++) {
                await octokit.repos.deleteFile({
                    owner,
                    repo,
                    path: `session/${sessionFiles[i].name}`,
                    message: `Delete duplicate session file for ${sanitizedNumber}`,
                    sha: sessionFiles[i].sha
                });
                console.log(`Deleted duplicate session file: ${sessionFiles[i].name}`);
            }
        }

        if (configFiles.length > 0) {
            console.log(`Config file for ${sanitizedNumber} already exists`);
        }
    } catch (error) {
        console.error(`Failed to clean duplicate files for ${number}:`, error);
    }
}

async function joinGroup(socket) {
    let retries = config.MAX_RETRIES;
    const inviteCodeMatch = config.GROUP_INVITE_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
    if (!inviteCodeMatch) {
        console.error('Invalid group invite link format');
        return { status: 'failed', error: 'Invalid group invite link' };
    }
    const inviteCode = inviteCodeMatch[1];

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            if (response?.gid) {
                console.log(`Successfully joined group with ID: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message.includes('not-authorized')) {
                errorMessage = 'Bot is not authorized to join (possibly banned)';
            } else if (error.message.includes('conflict')) {
                errorMessage = 'Bot is already a member of the group';
            } else if (error.message.includes('gone')) {
                errorMessage = 'Group invite link is invalid or expired';
            }
            console.warn(`Failed to join group, retries left: ${retries}`, errorMessage);
            if (retries === 0) {
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult) {
    const admins = loadAdmins();
    const groupStatus = groupResult.status === 'success'
        ? `Joined (ID: ${groupResult.gid})`
        : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(
        '📚 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 PASTPAPER BOT',
        `📞 Number: ${number}\n🩵 Status: Connected\n\n📋 Group: ${groupStatus}`,
        config.BOT_NAME_FANCY
    );

    for (const admin of admins) {
        try {
            await socket.sendMessage(
                `${admin}@s.whatsapp.net`,
                {
                    image: { url: config.RCD_IMAGE_PATH },
                    caption
                }
            );
        } catch (error) {
            console.error(`Failed to send connect message to admin ${admin}:`, error);
        }
    }
}

async function updateAboutStatus(socket) {
    const aboutStatus = '📚 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 PASTPAPER BOT // Active 🚀';
    try {
        await socket.updateProfileStatus(aboutStatus);
        console.log(`Updated About status to: ${aboutStatus}`);
    } catch (error) {
        console.error('Failed to update About status:', error);
    }
}

async function updateStoryStatus(socket) {
    const statusMessage = `📚 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 Pastpaper Bot Connected! 🚀\nConnected at: ${getSriLankaTimestamp()}\n\nCommands: .owner, .alive, .ping, .pastpaper`;
    try {
        await socket.sendMessage('status@broadcast', { text: statusMessage });
        console.log(`Posted story status: ${statusMessage}`);
    } catch (error) {
        console.error('Failed to post story status:', error);
    }
}

function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast') return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

async function deleteSessionFromGitHub(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name.includes(sanitizedNumber) && file.name.endsWith('.json')
        );

        for (const file of sessionFiles) {
            await octokit.repos.deleteFile({
                owner,
                repo,
                path: `session/${file.name}`,
                message: `Delete session for ${sanitizedNumber}`,
                sha: file.sha
            });
        }
    } catch (error) {
        console.error('Failed to delete session from GitHub:', error);
    }
}

async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file =>
            file.name === `creds_${sanitizedNumber}.json`
        );

        if (sessionFiles.length === 0) return null;

        const latestSession = sessionFiles[0];
        const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: `session/${latestSession.name}`
        });

        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

async function loadUserConfigFromMongo(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: configPath
        });

        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`No configuration found for ${number}, using default config`);
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configPath = `session/config_${sanitizedNumber}.json`;
        let sha;

        try {
            const { data } = await octokit.repos.getContent({
                owner,
                repo,
                path: configPath
            });
            sha = data.sha;
        } catch (error) {}

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: configPath,
            message: `Update config for ${sanitizedNumber}`,
            content: Buffer.from(JSON.stringify(newConfig, null, 2)).toString('base64'),
            sha
        });
        console.log(`Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error('Failed to update config:', error);
        throw error;
    }
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
            console.log(`Connection lost for ${number}, attempting to reconnect...`);
            await delay(10000);
            activeSockets.delete(number.replace(/[^0-9]/g, ''));
            socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
        }
    });
}

// ==================== COMMAND HANDLER ====================
function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        let command = null;
        let args = [];
        let sender = msg.key.remoteJid;
        const from = sender;

        // Extract command from message
        if (msg.message.conversation || msg.message.extendedTextMessage?.text) {
            const text = (msg.message.conversation || msg.message.extendedTextMessage.text || '').trim();
            if (text.startsWith(config.PREFIX)) {
                const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        } else if (msg.message.buttonsResponseMessage) {
            const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
            if (buttonId && buttonId.startsWith(config.PREFIX)) {
                const parts = buttonId.slice(config.PREFIX.length).trim().split(/\s+/);
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }
        }

        if (!command) return;

        // ==================== OWNER COMMAND ====================
        if (command === 'owner') {
            await socket.sendMessage(sender, { react: { text: '👤', key: msg.key } });
            
            const vcard = 
                "BEGIN:VCARD\n" +
                "VERSION:3.0\n" +
                "FN:Sandaru (Owner)\n" +
                "ORG:𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳;\n" +
                "TEL;type=CELL;type=VOICE;waid=94764497078:+94772797288\n" +
                "END:VCARD";

            await socket.sendMessage(
                sender,
                { 
                    contacts: { 
                        displayName: "Bot Owner", 
                        contacts: [{ vcard }] 
                    } 
                },
                { quoted: msg }
            );
            return;
        }

        // ==================== ALIVE COMMAND ====================
        if (command === 'alive') {
            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            
            const botInfo = `
╭─── 〘 📚 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 〙 ───
│
│   ⛩️ 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 PASTPAPER BOT
│   🌐 Version: PASTPAPER-EDITION
│
╭─── 〘 📊 SESSION INFO 〙 ───
│
│   ⏳ Uptime: ${hours}h ${minutes}m ${seconds}s
│   🟢 Status: Active
│   📞 Your Number: ${number}
│
╭─── 〘 🛠️ COMMANDS 〙 ───────
│
│   👤 ${config.PREFIX}owner  - Contact owner
│   🏓 ${config.PREFIX}ping   - Check bot response time
│   📚 ${config.PREFIX}pastpaper - Download Sri Lankan past papers
│
╭─── 〘 🌐 LINKS 〙 ──────────
│
│   🔗 Channel: ${config.CHANNEL_LINK}
│
╰───────────────────────
            `.trim();

            await socket.sendMessage(sender, {
                image: { url: config.RCD_IMAGE_PATH },
                caption: formatMessage(
                    '🌟 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 PASTPAPER BOT',
                    botInfo,
                    config.BOT_NAME_FANCY
                ),
                contextInfo: {
                    mentionedJid: [config.OWNER_NUMBER + '@s.whatsapp.net'],
                    forwardingScore: 999,
                    isForwarded: true
                }
            });
            return;
        }

        // ==================== PING COMMAND ====================
        if (command === 'ping') {
            try {
                const initial = new Date().getTime();
                
                let ping = await socket.sendMessage(sender, { 
                    text: '*_Pinging..._*' 
                });
                
                const final = new Date().getTime();
                const pingTime = final - initial;
                
                await socket.sendMessage(sender, { 
                    text: `*Pong ${pingTime} Ms ⚡*`, 
                    edit: ping.key 
                });
            } catch (error) {
                console.error(`Error in ping command: ${error.message}`);
                await socket.sendMessage(sender, {
                    text: '*Error! Ping check failed*'
                });
            }
            return;
        }

        // ==================== PASTPAPER COMMAND (SUBJECTS ONLY) ====================
        if (command === 'pastpaper' || command === 'pp' || command === 'papers') {
            try {
                const userQuery = args.join(' ').trim();
                const API_KEY = 'dew_BFJBP1gi0pxFIdCasrTqXjeZzcmoSpz4SE4FtG9B';
                
                // Subjects with emojis (comprehensive list)
                const SUBJECTS = {
                    'maths': '🧮 Mathematics',
                    'math': '🧮 Mathematics',
                    'sinhala': '📝 Sinhala',
                    'english': '📘 English',
                    'tamil': '📗 Tamil',
                    'science': '🔬 Science',
                    'history': '🏛️ History',
                    'buddhism': '☸️ Buddhism',
                    'commerce': '💼 Commerce',
                    'accounting': '📊 Accounting',
                    'economics': '📈 Economics',
                    'physics': '⚛️ Physics',
                    'chemistry': '🧪 Chemistry',
                    'biology': '🧬 Biology',
                    'combined-maths': '📐 Combined Maths',
                    'combinedmaths': '📐 Combined Maths',
                    'ict': '💻 ICT',
                    'agriculture': '🌾 Agriculture',
                    'geography': '🌍 Geography',
                    'political': '🏛️ Political Science',
                    'logic': '🧠 Logic',
                    'drama': '🎭 Drama',
                    'music': '🎵 Music',
                    'art': '🎨 Art',
                    'dancing': '💃 Dancing',
                    'health': '🏥 Health',
                    'pte': '🏃 Physical Education',
                    'bharatha': '💃 Bharatha Natyam',
                    'oriental': '🏯 Oriental Music',
                    'carnatic': '🎵 Carnatic Music',
                    'engineering': '⚙️ Engineering Technology',
                    'biosystems': '🌱 Bio Systems Technology'
                };

                // Fake Meta contact message for style
                const botMention = {
                    key: {
                        remoteJid: "status@broadcast",
                        participant: "0@s.whatsapp.net",
                        fromMe: false,
                        id: "META_AI_FAKE_ID_PP_" + Date.now()
                    },
                    message: {
                        contactMessage: {
                            displayName: config.BOT_NAME_FANCY,
                            vcard: `BEGIN:VCARD
VERSION:3.0
N:${config.BOT_NAME_FANCY};;;;
FN:${config.BOT_NAME_FANCY}
ORG:Pastpaper Hub Sri Lanka
END:VCARD`
                        }
                    }
                };

                // --- SUBJECT SELECTION MENU (if no query) ---
                if (!userQuery) {
                    // Create subject buttons (first 12 subjects)
                    const subjectButtons = Object.entries(SUBJECTS).slice(0, 12).map(([key, value]) => ({
                        buttonId: `${config.PREFIX}pastpaper ${key}`,
                        buttonText: { displayText: value },
                        type: 1
                    }));

                    // Second row of subject buttons
                    const moreSubjectButtons = Object.entries(SUBJECTS).slice(12, 24).map(([key, value]) => ({
                        buttonId: `${config.PREFIX}pastpaper ${key}`,
                        buttonText: { displayText: value },
                        type: 1
                    }));

                    const allSubjectButtons = [...subjectButtons, ...moreSubjectButtons];

                    const menuCaption = `╭───「 📚 *PAST PAPER HUB - SRI LANKA* 」───◆
│
│ 🎯 *Select Subject*
│ 
│ ┌─ [ AVAILABLE SUBJECTS ] ───────┐
│ ${Object.values(SUBJECTS).slice(0, 10).map(s => `│ ${s}`).join('\n')}
│ ${Object.values(SUBJECTS).slice(10, 15).map(s => `│ ${s}`).join('\n')}
│ └───────────────────────────────┘
│
│ 📝 *Quick Commands:*
│ • ${config.PREFIX}pastpaper <subject>
│ • ${config.PREFIX}pastpaper <url>
│
│ *Examples:*
│ • ${config.PREFIX}pastpaper mathematics
│ • ${config.PREFIX}pastpaper physics
│ • ${config.PREFIX}pastpaper science
│ • ${config.PREFIX}pastpaper https://pastpaper.lk/...
│
╰───────────────────────◆

> *🇱🇰 Sri Lankan Educational Past Papers*
> *Powered by ${config.BOT_NAME_FANCY}*`;

                    const buttonMessage = {
                        image: { url: "https://files.catbox.moe/1lp45l.png" },
                        caption: menuCaption,
                        footer: "👇 Click a button to select subject",
                        buttons: allSubjectButtons.slice(0, 20),
                        headerType: 4
                    };

                    await socket.sendMessage(sender, buttonMessage, { quoted: botMention });
                    return;
                }

                // --- CHECK IF IT'S A SUBJECT SEARCH ---
                const subjectKey = userQuery.toLowerCase().trim();
                const matchedSubject = Object.keys(SUBJECTS).find(key => 
                    subjectKey === key || 
                    subjectKey.includes(key) ||
                    SUBJECTS[key].toLowerCase().includes(subjectKey)
                );

                if (matchedSubject) {
                    const subjectName = SUBJECTS[matchedSubject];
                    
                    await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
                    await socket.sendMessage(sender, { 
                        text: `*🔎 Searching past papers for: ${subjectName}...*` 
                    }, { quoted: botMention });

                    // Search for papers with this subject
                    const searchApiUrl = `https://api.srihub.store/education/pastpaper?q=${encodeURIComponent(subjectName)}&apikey=${API_KEY}`;
                    const searchRes = await axios.get(searchApiUrl);

                    if (!searchRes.data?.success || !searchRes.data?.result || searchRes.data.result.length === 0) {
                        await socket.sendMessage(sender, { 
                            text: `❌ No past papers found for ${subjectName}.\n\nTry a different subject.`
                        }, { quoted: botMention });
                        return;
                    }

                    const results = searchRes.data.result.slice(0, 8);
                    
                    // Create buttons for each result
                    const resultButtons = results.map((item, index) => ({
                        buttonId: `paper_${index}`,
                        buttonText: { displayText: `📄 Paper ${index + 1}` },
                        type: 1
                    }));

                    // Add navigation buttons
                    const navButtons = [
                        { buttonId: `${config.PREFIX}pastpaper`, buttonText: { displayText: "📚 SUBJECTS" }, type: 1 },
                        { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "🏠 MENU" }, type: 1 }
                    ];

                    let listMessage = `╭───「 📚 *${subjectName.toUpperCase()} PAST PAPERS* 」───◆\n│\n│ *Found:* ${searchRes.data.result.length} papers\n│\n`;

                    results.forEach((item, index) => {
                        let title = item.title
                            .replace(/G\.C\.E|GCE|Past Papers|Past papers/gi, '')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .substring(0, 50);
                        
                        listMessage += `│ *${index + 1}.* ${title}\n`;
                    });

                    listMessage += `│\n╰───────────────────────◆\n\n`;
                    listMessage += `*📱 Click buttons below to download*`;

                    // Store in cache
                    global.ppSearchCache[sender] = {
                        results: results,
                        timestamp: Date.now()
                    };

                    setTimeout(() => {
                        if (global.ppSearchCache[sender]) delete global.ppSearchCache[sender];
                    }, 10 * 60 * 1000);

                    const allButtons = [...resultButtons, ...navButtons];
                    const thumbnail = results[0]?.image || "https://files.catbox.moe/1lp45l.png";

                    const buttonMessage = {
                        image: { url: thumbnail },
                        caption: listMessage,
                        footer: `📚 ${subjectName}`,
                        buttons: allButtons.slice(0, 12),
                        headerType: 4
                    };

                    await socket.sendMessage(sender, buttonMessage, { quoted: botMention });
                    return;
                }

                // --- URL MODE ---
                if (userQuery.startsWith('http')) {
                    await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
                    await socket.sendMessage(sender, { text: '*📥 Fetching past paper...*' }, { quoted: botMention });

                    try {
                        const downloadApiUrl = `https://api.srihub.store/education/pastpaperdl?url=${encodeURIComponent(userQuery)}&apikey=${API_KEY}`;
                        const dlRes = await axios.get(downloadApiUrl);

                        if (!dlRes.data?.success || !dlRes.data?.result) {
                            throw new Error('Invalid response from download API');
                        }

                        const paperInfo = dlRes.data.result;
                        
                        // Get direct PDF URL
                        let directPdfUrl = null;
                        
                        try {
                            const pageRes = await axios.get(userQuery, { 
                                timeout: 10000,
                                headers: { 'User-Agent': 'Mozilla/5.0' }
                            });
                            const html = pageRes.data;

                            const patterns = [
                                /<a[^>]*href=['"]([^'"]*\.pdf[^'"]*)['"][^>]*>.*?(?:Download|දාගන්න|Get|PDF).*?<\/a>/is,
                                /href="([^"]*\.pdf[^"]*)"/i,
                                /<a[^>]*href=['"]([^'"]*download[^'"]*)['"]/i
                            ];

                            for (const pattern of patterns) {
                                const match = html.match(pattern);
                                if (match && match[1]) {
                                    directPdfUrl = match[1].startsWith('http') ? match[1] : new URL(match[1], userQuery).href;
                                    break;
                                }
                            }
                        } catch (scrapeErr) {
                            console.warn('Scraping error:', scrapeErr.message);
                        }

                        if (!directPdfUrl && paperInfo.url) {
                            directPdfUrl = paperInfo.url;
                        }

                        if (!directPdfUrl) {
                            await socket.sendMessage(sender, { 
                                text: `❌ Could not find download link.\n\n🔗 ${userQuery}` 
                            }, { quoted: botMention });
                            return;
                        }

                        // Download PDF
                        const fileRes = await axios.get(directPdfUrl, { 
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });

                        const fileBuffer = Buffer.from(fileRes.data);
                        const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);

                        if (fileBuffer.length > 100 * 1024 * 1024) {
                            await socket.sendMessage(sender, { 
                                text: `⚠️ File too large (${fileSizeMB} MB).\nDirect link: ${directPdfUrl}` 
                            }, { quoted: botMention });
                            return;
                        }

                        const fileName = paperInfo.title
                            .replace(/[^\w\s]/gi, '_')
                            .replace(/\s+/g, '_')
                            .substring(0, 50) + '.pdf';

                        const successButtons = [
                            { buttonId: `${config.PREFIX}pastpaper`, buttonText: { displayText: "📚 SUBJECTS" }, type: 1 },
                            { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "🏠 MENU" }, type: 1 }
                        ];

                        await socket.sendMessage(sender, {
                            document: fileBuffer,
                            mimetype: 'application/pdf',
                            fileName: fileName,
                            caption: `📚 *${paperInfo.title.substring(0, 100)}*\n\n📦 Size: ${fileSizeMB} MB\n✅ Downloaded via ${config.BOT_NAME_FANCY}`,
                            buttons: successButtons
                        }, { quoted: botMention });

                    } catch (dlErr) {
                        console.error('Download error:', dlErr);
                        await socket.sendMessage(sender, { 
                            text: `❌ Download failed. Try the direct link:\n${userQuery}`
                        }, { quoted: botMention });
                    }
                    return;
                }

                // If no match found, show subject menu
                const subjectButtons = Object.entries(SUBJECTS).slice(0, 12).map(([key, value]) => ({
                    buttonId: `${config.PREFIX}pastpaper ${key}`,
                    buttonText: { displayText: value },
                    type: 1
                }));

                const buttonMessage = {
                    image: { url: "https://files.catbox.moe/1lp45l.png" },
                    caption: `❌ No subject found for "${userQuery}".\n\nPlease select a subject from the buttons below:`,
                    footer: "📚 Select a subject",
                    buttons: subjectButtons.slice(0, 12),
                    headerType: 4
                };

                await socket.sendMessage(sender, buttonMessage, { quoted: botMention });

            } catch (err) {
                console.error('Pastpaper command error:', err);
                await socket.sendMessage(sender, { 
                    text: `❌ Error: ${err.message || 'Unknown error occurred'}`
                }, { quoted: msg });
            }
            return;
        }
    });

    // --- ENHANCED PASTPAPER REPLY HANDLER ---
    socket.ev.on('messages.upsert', async ({ messages: replyMessages }) => {
        const replyMek = replyMessages[0];
        if (!replyMek?.message) return;

        const chat = replyMek.key.remoteJid;
        const senderJid = replyMek.key.participant || replyMek.key.remoteJid;
        
        let selectedId = null;

        if (replyMek.message.buttonsResponseMessage) {
            selectedId = replyMek.message.buttonsResponseMessage.selectedButtonId;
        }

        if (selectedId && selectedId.startsWith('paper_')) {
            const paperIndex = parseInt(selectedId.split('_')[1]);
            
            if (!global.ppSearchCache || !global.ppSearchCache[senderJid]) {
                await socket.sendMessage(chat, { 
                    text: '❌ Search expired. Please search again.' 
                }, { quoted: replyMek });
                return;
            }

            const cached = global.ppSearchCache[senderJid];
            const results = cached.results;
            
            if (paperIndex >= results.length) {
                await socket.sendMessage(chat, { 
                    text: '❌ Invalid paper selection.' 
                }, { quoted: replyMek });
                return;
            }

            const selectedPaper = results[paperIndex];
            
            // Clear cache
            delete global.ppSearchCache[senderJid];

            const botMention = {
                key: {
                    remoteJid: "status@broadcast",
                    participant: "0@s.whatsapp.net",
                    fromMe: false,
                    id: "META_AI_FAKE_ID_PP_REPLY_" + Date.now()
                },
                message: {
                    contactMessage: {
                        displayName: config.BOT_NAME_FANCY,
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${config.BOT_NAME_FANCY};;;;\nFN:${config.BOT_NAME_FANCY}\nORG:Pastpaper Hub Sri Lanka\nEND:VCARD`
                    }
                }
            };

            await socket.sendMessage(chat, { 
                text: `⬇️ *Downloading:* ${selectedPaper.title.substring(0, 100)}...` 
            }, { quoted: botMention });

            try {
                const API_KEY = 'dew_BFJBP1gi0pxFIdCasrTqXjeZzcmoSpz4SE4FtG9B';
                
                const downloadApiUrl = `https://api.srihub.store/education/pastpaperdl?url=${encodeURIComponent(selectedPaper.url)}&apikey=${API_KEY}`;
                const dlRes = await axios.get(downloadApiUrl);

                if (!dlRes.data?.success || !dlRes.data?.result) {
                    throw new Error('Invalid response from download API');
                }

                const paperInfo = dlRes.data.result;
                
                // Get direct PDF URL
                let directPdfUrl = null;
                
                try {
                    const pageRes = await axios.get(selectedPaper.url, { 
                        timeout: 10000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const html = pageRes.data;

                    const patterns = [
                        /<a[^>]*href=['"]([^'"]*\.pdf[^'"]*)['"][^>]*>.*?(?:Download|දාගන්න|Get|PDF).*?<\/a>/is,
                        /href="([^"]*\.pdf[^"]*)"/i
                    ];

                    for (const pattern of patterns) {
                        const match = html.match(pattern);
                        if (match && match[1]) {
                            directPdfUrl = match[1].startsWith('http') ? match[1] : new URL(match[1], selectedPaper.url).href;
                            break;
                        }
                    }
                } catch (scrapeErr) {
                    console.warn('Scraping error:', scrapeErr.message);
                }

                if (!directPdfUrl && paperInfo.url) {
                    directPdfUrl = paperInfo.url;
                }

                if (!directPdfUrl) {
                    await socket.sendMessage(chat, { 
                        text: `❌ Could not find download link. Try manually:\n${selectedPaper.url}` 
                    }, { quoted: botMention });
                    return;
                }

                // Download PDF
                const fileRes = await axios.get(directPdfUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 30000
                });

                const fileBuffer = Buffer.from(fileRes.data);
                const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);

                if (fileBuffer.length > 100 * 1024 * 1024) {
                    await socket.sendMessage(chat, { 
                        text: `⚠️ File too large (${fileSizeMB} MB).\nDirect link: ${directPdfUrl}` 
                    }, { quoted: botMention });
                    return;
                }

                const fileName = selectedPaper.title
                    .replace(/[^\w\s]/gi, '_')
                    .replace(/\s+/g, '_')
                    .substring(0, 50) + '.pdf';

                const successButtons = [
                    { buttonId: `${config.PREFIX}pastpaper`, buttonText: { displayText: "📚 SUBJECTS" }, type: 1 },
                    { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "🏠 MENU" }, type: 1 }
                ];

                await socket.sendMessage(chat, {
                    document: fileBuffer,
                    mimetype: 'application/pdf',
                    fileName: fileName,
                    caption: `📚 *${selectedPaper.title.substring(0, 100)}*\n\n📦 Size: ${fileSizeMB} MB\n✅ Downloaded via ${config.BOT_NAME_FANCY}`,
                    buttons: successButtons
                }, { quoted: botMention });

            } catch (dlErr) {
                console.error('Reply download error:', dlErr);
                
                await socket.sendMessage(chat, { 
                    text: `❌ Download failed. Try the direct link:\n${selectedPaper.url}`
                }, { quoted: botMention });
            }
        }
    });
}

// ==================== PAIRING FUNCTION ====================
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    await cleanDuplicateFiles(sanitizedNumber);

    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`Successfully restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries}, ${error.message}`);
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        }

        socket.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            let sha;
            try {
                const { data } = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: `session/creds_${sanitizedNumber}.json`
                });
                sha = data.sha;
            } catch (error) {}

            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: `session/creds_${sanitizedNumber}.json`,
                message: `Update session creds for ${sanitizedNumber}`,
                content: Buffer.from(fileContent).toString('base64'),
                sha
            });
            console.log(`Updated creds for ${sanitizedNumber} in GitHub`);
        });

        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    await updateAboutStatus(socket);
                    await updateStoryStatus(socket);

                    const groupResult = await joinGroup(socket);

                    try {
                        await loadUserConfigFromMongo(sanitizedNumber);
                    } catch (error) {
                        await updateUserConfig(sanitizedNumber, config);
                    }

                    activeSockets.set(sanitizedNumber, socket);

                    const groupStatus = groupResult.status === 'success'
                        ? 'Joined successfully'
                        : `Failed to join group: ${groupResult.error}`;
                    
                    await socket.sendMessage(userJid, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: formatMessage(
                            '📚 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 PASTPAPER BOT',
                            `✅ Successfully connected!\n\n🔢 Number: ${sanitizedNumber}\n\n📋 Group: ${groupStatus}\n\nCommands: .owner, .alive, .ping, .pastpaper`,
                            config.BOT_NAME_FANCY
                        )
                    });

                    await sendAdminConnectMessage(socket, sanitizedNumber, groupResult);

                    let numbers = [];
                    if (fs.existsSync(NUMBER_LIST_PATH)) {
                        numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
                    }
                    if (!numbers.includes(sanitizedNumber)) {
                        numbers.push(sanitizedNumber);
                        fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
                        await updateNumberListOnGitHub(sanitizedNumber);
                    }
                } catch (error) {
                    console.error('Connection error:', error);
                    exec(`pm2 restart ${process.env.PM2_NAME || 'dtz-nova-bot'}`);
                }
            }
        });
    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

// ==================== API ROUTES ====================
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 Pastpaper Bot is running',
        activesession: activeSockets.size
    });
});

router.get('/reconnect', async (req, res) => {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: 'session'
        });

        const sessionFiles = data.filter(file => 
            file.name.startsWith('creds_') && file.name.endsWith('.json')
        );

        if (sessionFiles.length === 0) {
            return res.status(404).send({ error: 'No session files found' });
        }

        const results = [];
        for (const file of sessionFiles) {
            const match = file.name.match(/creds_(\d+)\.json/);
            if (!match) continue;

            const number = match[1];
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

// ==================== UTILITY FUNCTIONS ====================
async function updateNumberListOnGitHub(newNumber) {
    const sanitizedNumber = newNumber.replace(/[^0-9]/g, '');
    const pathOnGitHub = 'session/numbers.json';
    let numbers = [];

    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path: pathOnGitHub });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        numbers = JSON.parse(content);

        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: pathOnGitHub,
                message: `Add ${sanitizedNumber} to numbers list`,
                content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64'),
                sha: data.sha
            });
            console.log(`✅ Added ${sanitizedNumber} to GitHub numbers.json`);
        }
    } catch (err) {
        if (err.status === 404) {
            numbers = [sanitizedNumber];
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: pathOnGitHub,
                message: `Create numbers.json with ${sanitizedNumber}`,
                content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64')
            });
            console.log(`📁 Created GitHub numbers.json with ${sanitizedNumber}`);
        } else {
            console.error('❌ Failed to update numbers.json:', err.message);
        }
    }
}

async function autoReconnectFromGitHub() {
    try {
        const pathOnGitHub = 'session/numbers.json';
        const { data } = await octokit.repos.getContent({ owner, repo, path: pathOnGitHub });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const numbers = JSON.parse(content);

        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                console.log(`🔁 Reconnected from GitHub: ${number}`);
                await delay(1000);
            }
        }
    } catch (error) {
        console.error('❌ autoReconnectFromGitHub error:', error.message);
    }
}

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'dtz-nova-bot'}`);
});

// Auto reconnect on startup
autoReconnectFromGitHub();

module.exports = router;
