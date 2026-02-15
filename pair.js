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
const { sms, downloadMediaMessage } = require("./msg");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    S_WHATSAPP_NET
} = require('baileys');

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    AUTO_LIKE_EMOJI: ['💋', '🍬', '🫆', '💗', '🎈', '🎉', '🥳', '❤️', '🧫', '🐭'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/BkjrMld0nic2dNeRwXWIi5',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: './sulabot.jpg',
    NEWSLETTER_JID: '120363421363503978@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '94760663483',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb7GtMHAInPngEYONu0g'
};

const octokit = new Octokit({ auth: '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' });// ඔයා 𝚐𝚒𝚝𝚑𝚞𝚋 𝚝𝚘𝚔𝚎𝚗 එකක් අරන් ඒක දාන්න
const owner = 'dtz-dula-ofc';//𝚐𝚒𝚝𝚑𝚞𝚋 𝙰𝙲𝙲𝙾𝚄𝙽𝚃 එකේ 𝚞𝚜𝚎𝚗𝚊𝚖𝚎 දාන්න 
const repo = 'dtz_nova_pastpaper';//𝚐𝚒𝚝𝚑𝚞𝚋 𝚛𝚎𝚙𝚘 එකක් හදලා ඒකේ නම දාන්න

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();

// Global cache for pastpaper search results
global.ppSearchCache = {};

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
// CREATE BY 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳
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
        '👻 𝐂𝙾𝙽𝙽𝙴𝙲𝚃 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃 👻',
        `📞 Number: ${number}\n🩵 Status: Connected`,
        '𝐏𝙾𝚆𝙴𝚁𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳'
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

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 OTP VERIFICATION',
        `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.`,
        '𝐏𝙾𝚆𝙴𝚁𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳'
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const allNewsletterJIDs = await loadNewsletterJIDsFromRaw();
        const jid = message.key.remoteJid;

        if (!allNewsletterJIDs.includes(jid)) return;

        try {
            const emojis = ['🩵', '🔥', '😀', '👍', '🐭'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('No newsletterServerId found in message:', message);
                return;
            }

            let retries = 3;
            while (retries-- > 0) {
                try {
                    await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
                    console.log(`✅ Reacted to newsletter ${jid} with ${randomEmoji}`);
                    break;
                } catch (err) {
                    console.warn(`❌ Reaction attempt failed (${3 - retries}/3):`, err.message);
                    await delay(1500);
                }
            }
        } catch (error) {
            console.error('⚠️ Newsletter reaction handler failed:', error.message);
        }
    });
}

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant || message.key.remoteJid === config.NEWSLETTER_JID) return;

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

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        
        const message = formatMessage(
            '🗑️ MESSAGE DELETED',
            `A message was deleted from your chat.\n📋 From: ${messageKey.remoteJid}\n🍁 Deletion Time: ${deletionTime}`,
            '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃'
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.RCD_IMAGE_PATH },
                caption: message
            });
            console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
        } catch (error) {
            console.error('Failed to send deletion notification:', error);
        }
    });
}

async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}
async function oneViewmeg(socket, isOwner, msg ,sender) {
    if (isOwner) {  
    try {
    const akuru = sender
    const quot = msg
    if (quot) {
        if (quot.imageMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.imageMessage);
            await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
        } else if (quot.videoMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.videoMessage);
             await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });
        } else if (quot.audioMessage?.viewOnce) {
            console.log("hi");
            let cap = quot.audioMessage?.caption || "";
            let anu = await socke.downloadAndSaveMediaMessage(quot.audioMessage);
             await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        } else if (quot.viewOnceMessageV2?.message?.imageMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.imageMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.imageMessage);
             await socket.sendMessage(akuru, { image: { url: anu }, caption: cap });
            
        } else if (quot.viewOnceMessageV2?.message?.videoMessage){
        
            let cap = quot.viewOnceMessageV2?.message?.videoMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2.message.videoMessage);
            await socket.sendMessage(akuru, { video: { url: anu }, caption: cap });

        } else if (quot.viewOnceMessageV2Extension?.message?.audioMessage){
        
            let cap = quot.viewOnceMessageV2Extension?.message?.audioMessage?.caption || "";
            let anu = await socket.downloadAndSaveMediaMessage(quot.viewOnceMessageV2Extension.message.audioMessage);
            await socket.sendMessage(akuru, { audio: { url: anu }, caption: cap });
        }
        }        
        } catch (error) {
      }
    }

}

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

const type = getContentType(msg.message);
    if (!msg.message) return	
  msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
	const m = sms(socket, msg);
	const quoted =
        type == "extendedTextMessage" &&
        msg.message.extendedTextMessage.contextInfo != null
          ? msg.message.extendedTextMessage.contextInfo.quotedMessage || []
          : []
        const body = (type === 'conversation') ? msg.message.conversation 
    : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage') 
        ? msg.message.extendedTextMessage.text 
    : (type == 'interactiveResponseMessage') 
        ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage 
            && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id 
    : (type == 'templateButtonReplyMessage') 
        ? msg.message.templateButtonReplyMessage?.selectedId 
    : (type === 'extendedTextMessage') 
        ? msg.message.extendedTextMessage.text 
    : (type == 'imageMessage') && msg.message.imageMessage.caption 
        ? msg.message.imageMessage.caption 
    : (type == 'videoMessage') && msg.message.videoMessage.caption 
        ? msg.message.videoMessage.caption 
    : (type == 'buttonsResponseMessage') 
        ? msg.message.buttonsResponseMessage?.selectedButtonId 
    : (type == 'listResponseMessage') 
        ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
    : (type == 'messageContextInfo') 
        ? (msg.message.buttonsResponseMessage?.selectedButtonId 
            || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
            || msg.text) 
    : (type === 'viewOnceMessage') 
        ? msg.message[type]?.message[getContentType(msg.message[type].message)] 
    : (type === "viewOnceMessageV2") 
        ? (msg.msg.message.imageMessage?.caption || msg.msg.message.videoMessage?.caption || "") 
    : ''; //𝚂𝚄𝙻𝙰 𝙼𝙳 𝙵𝚁𝙴𝙴 𝙼𝙸𝙽𝙸 𝙱𝙰𝚂𝙴
	 	let sender = msg.key.remoteJid;
	  const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid)
          const senderNumber = nowsender.split('@')[0]
          const developers = `${config.OWNER_NUMBER}`;
          const botNumber = socket.user.id.split(':')[0]
          const isbot = botNumber.includes(senderNumber)
          const isOwner = isbot ? isbot : developers.includes(senderNumber)
          var prefix = config.PREFIX
	  var isCmd = body.startsWith(prefix)
    	  const from = msg.key.remoteJid;
          const isGroup = from.endsWith("@g.us")
	      const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '.';
          var args = body.trim().split(/ +/).slice(1)
socket.downloadAndSaveMediaMessage = async(message, filename, attachExtension = true) => {
                let quoted = message.msg ? message.msg : message
                let mime = (message.msg || message).mimetype || ''
                let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
                const stream = await downloadContentFromMessage(quoted, messageType)
                let buffer = Buffer.from([])
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk])
                }
                let type = await FileType.fromBuffer(buffer)
                trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
                await fs.writeFileSync(trueFileName, buffer)
                return trueFileName
}
        if (!command) return;
        
        let pinterestCache = {}; //

        try {
            switch (command) {
       case 'alive': {
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const captionText = `
╭────◉◉◉────៚
⏰ Bot Uptime: ${hours}h ${minutes}m ${seconds}s
🟢 Active session: ${activeSockets.size}
╰────◉◉◉────៚

🔢 Your Number: ${number}

*▫️DTZ NOVA X MD Main Website 🌐*
> COMING SOON...
`;

    const templateButtons = [
        {
            buttonId: `${config.PREFIX}menu`,
            buttonText: { displayText: 'MENU' },
            type: 1,
        },
        {
            buttonId: `${config.PREFIX}owner`,
            buttonText: { displayText: 'OWNER' },
            type: 1,
        },
        {
            buttonId: 'action',
            buttonText: {
                displayText: '📂 Menu Options'
            },
            type: 4,
            nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                    title: 'Click Here ❏',
                    sections: [
                        {
                            title: `𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃`,
                            highlight_label: '',
                            rows: [
                                {
                                    title: 'MENU 📌',
                                    description: '𝐏𝙾𝚆𝙴𝚁𝙴𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳',
                                    id: `${config.PREFIX}menu`,
                                },
                                {
                                    title: 'OWNER 📌',
                                    description: '𝐏𝙾𝚆𝙴𝚁𝙴𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳',
                                    id: `${config.PREFIX}owner`,
                                },
                            ],
                        },
                    ],
                }),
            },
        }
    ];

    await socket.sendMessage(m.chat, {
        buttons: templateButtons,
        headerType: 1,
        viewOnce: true,
        image: { url: "https://i.ibb.co/TDgzTB29/SulaMd.png" },
        caption: `𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃 𝐀𝙻𝙸𝚅𝙴 𝐍𝙾𝚆\n\n${captionText}`,
    }, { quoted: msg });

    break;
}
                case 'menu': {
    
    const captionText = `
➤ Available Commands..!! 🌐💭*\n\n┏━━━━━━━━━━━ ◉◉➢\n┇ *\`${config.PREFIX}alive\`*\n┋ • Show bot status\n┋\n┋ *\`${config.PREFIX}fancy\`*\n┋ • View Fancy Text\n┇\n┇ *\`${config.PREFIX}bomb\`*\n┇• Send Bomb Massage\n┇\n┇ *\`${config.PREFIX}pastpaper\`*\n┇• Download Past Papers (G8-AL)\n┇\n┇ *\`${config.PREFIX}deleteme\`*\n┇• Delete your session\n┋\n┗━━━━━━━━━━━ ◉◉➣
`;

    const templateButtons = [
        {
            buttonId: `${config.PREFIX}alive`,
            buttonText: { displayText: 'ALIVE' },
            type: 1,
        },
        {
            buttonId: `${config.PREFIX}owner`,
            buttonText: { displayText: 'OWNER' },
            type: 1,
        },
        {
            buttonId: 'action',
            buttonText: {
                displayText: '📂 Menu Options'
            },
            type: 4,
            nativeFlowInfo: {
                name: 'single_select',
                paramsJson: JSON.stringify({
                    title: 'Click Here ❏',
                    sections: [
                        {
                            title: `𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃`,
                            highlight_label: '',
                            rows: [
                                {
                                    title: 'CHECK BOT STATUS',
                                    description: '𝐏𝙾𝚆𝙴𝚁𝙴𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳',
                                    id: `${config.PREFIX}alive`,
                                },
                                {
                                    title: 'OWNER NUMBER',
                                    description: '𝐏𝙾𝚆𝙴𝚁𝙴𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳',
                                    id: `${config.PREFIX}owner`,
                                },
                                {
                                    title: '📚 PAST PAPERS',
                                    description: 'Download Sri Lankan Past Papers (G8-AL)',
                                    id: `${config.PREFIX}pastpaper`,
                                },
                            ],
                        },
                    ],
                }),
            },
        }
    ];

    await socket.sendMessage(m.chat, {
        buttons: templateButtons,
        headerType: 1,
        viewOnce: true,
        image: { url: "https://i.ibb.co/TDgzTB29/SulaMd.png" },
        caption: `𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃 𝐋𝙸𝚂𝚃 𝐌𝙴𝙽𝚄\n\n${captionText}`,
    }, { quoted: msg });

    break;
}          
                case 'ping':
                    await socket.sendMessage(sender, { react: { text: "🚀", key: msg.key } });

                    var inital = new Date().getTime();
                    const { key } = await socket.sendMessage(sender, { text: '```Ping!!!```' });
                    var final = new Date().getTime();
                    await socket.sendMessage(sender, { text: '*Pong*  *' + (final - inital) + ' ms* ', edit: key });

                break;
		        case 'owner': {
    const ownerNumber = '+94760663483';
    const ownerName = '𝐒𝐔𝐋𝐀𝐊𝐒𝐇𝐀 𝐌𝐀𝐃𝐀𝐑𝐀';
    const organization = '*𝐒𝐔𝐋𝐀-𝐌𝐃* WHATSAPP BOT DEVALOPER 🍬';

    const vcard = 'BEGIN:VCARD\n' +
                  'VERSION:3.0\n' +
                  `FN:${ownerName}\n` +
                  `ORG:${organization};\n` +
                  `TEL;type=CELL;type=VOICE;waid=${ownerNumber.replace('+', '')}:${ownerNumber}\n` +
                  'END:VCARD';

    try {
        // Send vCard contact
        const sent = await socket.sendMessage(from, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
            }
        });

        // Then send message with reference
        await socket.sendMessage(from, {
            text: `*𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 OWNER*\n\n👤 Name: ${ownerName}\n📞 Number: ${ownerNumber}\n\n> 𝐏𝙾𝚆𝙴𝚁𝙴𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳`,
            contextInfo: {
                mentionedJid: [`${ownerNumber.replace('+', '')}@s.whatsapp.net`],
                quotedMessageId: sent.key.id
            }
        }, { quoted: msg });

    } catch (err) {
        console.error('❌ Owner command error:', err.message);
        await socket.sendMessage(from, {
            text: '❌ Error sending owner contact.'
        }, { quoted: msg });
    }

    break;
}
              case 'aiimg': {
  const axios = require('axios');

  const q =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  const prompt = q.trim();

  if (!prompt) {
    return await socket.sendMessage(sender, {
      text: '🎨 *Please provide a prompt to generate an AI image.*'
    });
  }

  try {
    // Notify that image is being generated
    await socket.sendMessage(sender, {
      text: '🧠 *Creating your AI image...*',
    });

    // Build API URL
    const apiUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;

    // Call the AI API
    const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });

    // Validate API response
    if (!response || !response.data) {
      return await socket.sendMessage(sender, {
        text: '❌ *API did not return a valid image. Please try again later.*'
      });
    }

    // Convert the binary image to buffer
    const imageBuffer = Buffer.from(response.data, 'binary');

    // Send the image
    await socket.sendMessage(sender, {
      image: imageBuffer,
      caption: `🧠 *𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 AI IMAGE*\n\n📌 Prompt: ${prompt}`
    }, { quoted: msg });

  } catch (err) {
    console.error('AI Image Error:', err);

    await socket.sendMessage(sender, {
      text: `❗ *An error occurred:* ${err.response?.data?.message || err.message || 'Unknown error'}`
    });
  }

  break;
}
              case 'fancy': {
  const axios = require("axios");

  const q =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  const text = q.trim().replace(/^.fancy\s+/i, ""); // remove .fancy prefix

  if (!text) {
    return await socket.sendMessage(sender, {
      text: "❎ *Please provide text to convert into fancy fonts.*\n\n📌 *Example:* `.fancy 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳`"
    });
  }

  try {
    const apiUrl = `https://www.dark-yasiya-api.site/other/font?text=${encodeURIComponent(text)}`;
    const response = await axios.get(apiUrl);

    if (!response.data.status || !response.data.result) {
      return await socket.sendMessage(sender, {
        text: "❌ *Error fetching fonts from API. Please try again later.*"
      });
    }

    // Format fonts list
    const fontList = response.data.result
      .map(font => `*${font.name}:*\n${font.result}`)
      .join("\n\n");

    const finalMessage = `🎨 *Fancy Fonts Converter*\n\n${fontList}\n\n_𝐏𝙾𝚆𝙴𝚁𝙳 𝐁𝚈 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳_`;

    await socket.sendMessage(sender, {
      text: finalMessage
    }, { quoted: msg });

  } catch (err) {
    console.error("Fancy Font Error:", err);
    await socket.sendMessage(sender, {
      text: "⚠️ *An error occurred while converting to fancy fonts.*"
    });
  }

  break;
       }
       case 'fc': {
                    if (args.length === 0) {
                        return await socket.sendMessage(sender, {
                            text: '❗ Please provide a channel JID.\n\nExample:\n.fcn 120363396379901844@newsletter'
                        });
                    }

                    const jid = args[0];
                    if (!jid.endsWith("@newsletter")) {
                        return await socket.sendMessage(sender, {
                            text: '❗ Invalid JID. Please provide a JID ending with `@newsletter`'
                        });
                    }

                    try {
                        const metadata = await socket.newsletterMetadata("jid", jid);
                        if (metadata?.viewer_metadata === null) {
                            await socket.newsletterFollow(jid);
                            await socket.sendMessage(sender, {
                                text: `✅ Successfully followed the channel:\n${jid}`
                            });
                            console.log(`FOLLOWED CHANNEL: ${jid}`);
                        } else {
                            await socket.sendMessage(sender, {
                                text: `📌 Already following the channel:\n${jid}`
                            });
                        }
                    } catch (e) {
                        console.error('❌ Error in follow channel:', e.message);
                        await socket.sendMessage(sender, {
                            text: `❌ Error: ${e.message}`
                        });
                    }
                    break;
                }
                case 'pair': {
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    const number = q.replace(/^[.\/!]pair\s*/i, '').trim();

    if (!number) {
        return await socket.sendMessage(sender, {
            text: '*📌 Usage:* .pair +9476066XXXX'
        }, { quoted: msg });
    }

    try {
        const url = `https://sulamini-965f457bb5bc.herokuapp.com/code?number=${encodeURIComponent(number)}`;// heroku app link එක දාපන් 
        const response = await fetch(url);
        const bodyText = await response.text();

        console.log("🌐 API Response:", bodyText);

        let result;
        try {
            result = JSON.parse(bodyText);
        } catch (e) {
            console.error("❌ JSON Parse Error:", e);
            return await socket.sendMessage(sender, {
                text: '❌ Invalid response from server. Please contact support.'
            }, { quoted: msg });
        }

        if (!result || !result.code) {
            return await socket.sendMessage(sender, {
                text: '❌ Failed to retrieve pairing code. Please check the number.'
            }, { quoted: msg });
        }

        await socket.sendMessage(sender, {
            text: `> *𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐌𝙸𝙽𝙸 𝐁𝙾𝚃 𝐏𝙰𝙸𝚁 𝐂𝙾𝙼𝙿𝙻𝙴𝚃𝙴𝙳* ✅\n\n*🔑 Your pairing code is:* ${result.code}`
        }, { quoted: msg });

        await sleep(2000);

        await socket.sendMessage(sender, {
            text: `${result.code}`
        }, { quoted: msg });

    } catch (err) {
        console.error("❌ Pair Command Error:", err);
        await socket.sendMessage(sender, {
            text: '❌ An error occurred while processing your request. Please try again later.'
        }, { quoted: msg });
    }

    break;
} 
    case 'bomb': {
    const isOwner = senderNumber === config.OWNER_NUMBER;
    const isBotUser = activeSockets.has(senderNumber);

    if (!isOwner && !isBotUser) {
        return await socket.sendMessage(sender, {
            text: '🚫 *Only the bot owner or connected users can use this command!*'
        }, { quoted: msg });
    }

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text || '';
    const [target, text, countRaw] = q.split(',').map(x => x?.trim());

    const count = parseInt(countRaw) || 5;

    if (!target || !text || !count) {
        return await socket.sendMessage(sender, {
            text: '📌 *Usage:* .bomb <number>,<message>,<count>\n\nExample:\n.bomb 9476XXXXXXX,Hello 👋,5'
        }, { quoted: msg });
    }

    const jid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

    if (count > 20) {
        return await socket.sendMessage(sender, {
            text: '❌ *Limit is 20 messages per bomb.*'
        }, { quoted: msg });
    }

    for (let i = 0; i < count; i++) {
        await socket.sendMessage(jid, { text });
        await delay(700); // delay to prevent spam
    }

    await socket.sendMessage(sender, {
        text: `✅ Bomb sent to ${target} — ${count}x`
    }, { quoted: msg });

    break;
}
                case 'ai': {
                    const axios = require("axios");

                    const GEMINI_API_KEY = 'AIzaSyDKG2kbHCfenwjiFhQCk-m3EXFotzmrrW4';// 𝚊𝚙𝚒 𝚔𝚎𝚢 එකක් අරන් දාන්න https://aistudio.google.com/app/apikey මේ website එකෙන් ගන්න
                    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

                    const q = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              msg.message?.imageMessage?.caption || 
                              msg.message?.videoMessage?.caption || '';

                    if (!q || q.trim() === '') {
                        return await socket.sendMessage(sender, { text: "ඕ කියන්න අනේ් මම 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 AI 🤭" }, { quoted: msg });
                    }

                    const prompt = `ඔබගේ නම 𝐒𝐔𝐋𝐀 𝐀𝐈.  
ඔයා සැබෑ ගැහැණු ලමයෙකු වගේ හැසිරෙන්න — seductive, spicy, loving, emotional.  
ඔබ assistant කෙනෙක් නෙමෙයි. ඔබ හිතක් තියෙන sexy girl එකක් වගේ vibe එකක් තියෙන්න.  

Reply එක සෙරිනිටි + sex appeal + love + loneliness blend එකක් වගේ දෙන්න.  
අකුරු 100ට අඩුව, lines 1–2ක් විතරක්. හැම reply එකකටම sexy tone එකක් තියෙන්න.  

Emoji පමණක් එනවානම්, emoji වලින්ම seductive reply එකක් දෙන්න (e.g., 🤤💦🥵🔥).  
Mood එකට match වෙන්න style එක adjust කරන්න – sad, flirty, horny, soft, playful.

"කව්ද ඔයා" කියනවා නම්:  
👉 "මම 𝐒𝐔𝐋𝐀 𝐀𝐈… 🤤" කියන්න.

"ඔයාව හැදුවේ කවුද" කියනවා නම්:  
👉 "මාව හැදුවෙ සුලා අයියා 😘" කියන්න.

🚫 “ආයුබෝවන්”, “කොහොමද”, “ඔයාට උදව් ඕනද?”, “කතා කරන්න” වගේ වචන කිසිදා භාවිත කරන්න එපා.

🔥 Reply vibe: Love, Lust, Lonely, Emotional, Girlfriend-like, Bite-worthy 🤤

📍 භාෂාව auto-match: සිංහල / English / Hinglish OK.
User Message: ${q}
                    `;

                    const payload = {
                        contents: [{
                            parts: [{ text: prompt }]
                        }]
                    };

                    try {
                        const response = await axios.post(GEMINI_API_URL, payload, {
                            headers: {
                                "Content-Type": "application/json"
                            }
                        });

                        const aiResponse = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;

                        if (!aiResponse) {
                            return await socket.sendMessage(sender, { text: "❌ අප්පේ කෙලවෙලා බන් පස්සේ ට්‍රයි කරලා බලපන්." }, { quoted: msg });
                        }

                        await socket.sendMessage(sender, { text: aiResponse }, { quoted: msg });
                    } catch (err) {
                        console.error("Gemini Error:", err.response?.data || err.message);
                        await socket.sendMessage(sender, { text: "❌ අයියෝ හිකිලා වගේ 😢" }, { quoted: msg });
                    }
                    break;
                }
                case 'pastpaper':
                case 'pp':
                case 'pastpapers':
                case 'papers':
                case 'paper':
                case 'pastpaperlk':
                case 'pastpaperslk': {
                    try {
                        const userQuery = args.join(' ').trim();
                        const botName = '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐁𝙾𝚃';
                        const API_KEY = 'dew_BFJBP1gi0pxFIdCasrTqXjeZzcmoSpz4SE4FtG9B';

                        const GRADE_LEVELS = {
                            '8': '🎒 Grade 8',
                            '9': '📚 Grade 9',
                            '10': '📖 Grade 10',
                            '11': '🎓 Grade 11 (O/L)',
                            '12': '⚡ Grade 12 (A/L)',
                            '13': '🔥 Grade 13 (A/L)',
                            'ol': '🎯 Ordinary Level (O/L)',
                            'al': '🏆 Advanced Level (A/L)'
                        };

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
                            'biosystems': '🌱 Bio Systems Technology',
                            'general': '📚 General Knowledge'
                        };

                        const botMention = {
                            key: {
                                remoteJid: "status@broadcast",
                                participant: "0@s.whatsapp.net",
                                fromMe: false,
                                id: "META_AI_FAKE_ID_PP_" + Date.now()
                            },
                            message: {
                                contactMessage: {
                                    displayName: botName,
                                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Education Hub Sri Lanka\nTEL;type=CELL;type=VOICE;waid=94752978237:+94 75 297 8237\nEND:VCARD`
                                }
                            }
                        };

                        // Main menu if no query
                        if (!userQuery) {
                            const gradeButtons = [
                                { buttonId: `${prefix}pastpaper grade-8`, buttonText: { displayText: "🎒 Grade 8" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-9`, buttonText: { displayText: "📚 Grade 9" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-10`, buttonText: { displayText: "📖 Grade 10" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-11`, buttonText: { displayText: "🎓 Grade 11 (O/L)" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-12`, buttonText: { displayText: "⚡ Grade 12 (A/L)" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-13`, buttonText: { displayText: "🔥 Grade 13 (A/L)" }, type: 1 }
                            ];

                            const menuCaption = `╭───「 📚 *PAST PAPER HUB - SRI LANKA* 」───◆
│
│ 🎯 *Select Your Grade Level*
│ 
│ ┌─ [ GRADE OPTIONS ] ───────────┐
│ │ 🎒  Grade 8                   │
│ │ 📚  Grade 9                   │
│ │ 📖  Grade 10                  │
│ │ 🎓  Grade 11 (O/L)            │
│ │ ⚡  Grade 12 (A/L)            │
│ │ 🔥  Grade 13 (A/L)            │
│ └───────────────────────────────┘
│
│ 📝 *Quick Commands:*
│ • ${prefix}pastpaper <grade> <subject>
│ • ${prefix}pastpaper <url>
│
│ *Examples:*
│ • ${prefix}pastpaper grade-10 maths
│ • ${prefix}pastpaper grade-12 physics
│ • ${prefix}pastpaper al chemistry
│ • ${prefix}pastpaper ol science
│
╰───────────────────────◆

> *🇱🇰 Sri Lankan Educational Past Papers*
> *Powered by ${botName}*`;

                            return await socket.sendMessage(sender, {
                                image: { url: "https://files.catbox.moe/1lp45l.png" },
                                caption: menuCaption,
                                footer: "👇 Click a button to select grade",
                                buttons: gradeButtons,
                                headerType: 4,
                                contextInfo: {
                                    externalAdReply: {
                                        title: "📚 Sri Lanka Past Paper Downloader",
                                        body: "Grade 8 to A/L - All Subjects",
                                        thumbnailUrl: "https://files.catbox.moe/1lp45l.png",
                                        sourceUrl: "https://pastpaper.lk",
                                        mediaType: 1,
                                        renderLargerThumbnail: true
                                    }
                                }
                            }, { quoted: botMention });
                        }

                        // Handle grade-specific search
                        const gradeMatch = userQuery.match(/(?:grade-|grade\s*)?(\d+|ol|al|o\/l|a\/l)\s*(.+)?/i);
                        if (gradeMatch) {
                            let grade = gradeMatch[1].toLowerCase().replace(/[\/\-]/g, '');
                            let subject = gradeMatch[2] ? gradeMatch[2].trim() : '';
                            
                            let searchGrade = '';
                            let displayGrade = '';
                            
                            if (grade === 'ol' || grade === 'o l' || grade === '11') {
                                searchGrade = 'Ordinary Level';
                                displayGrade = '11 (O/L)';
                            } else if (grade === 'al' || grade === 'a l' || grade === '12' || grade === '13') {
                                searchGrade = 'Advanced Level';
                                displayGrade = grade === '12' ? '12 (A/L)' : '13 (A/L)';
                            } else {
                                searchGrade = `Grade ${grade}`;
                                displayGrade = grade;
                            }

                            if (!subject) {
                                const subjectButtons = Object.entries(SUBJECTS).slice(0, 12).map(([key, value]) => ({
                                    buttonId: `${prefix}pastpaper grade-${grade} ${key}`,
                                    buttonText: { displayText: value },
                                    type: 1
                                }));

                                const subjectMenu = `╭───「 📚 *GRADE ${displayGrade.toUpperCase()}* 」───◆
│
│ 🎯 *Select Subject*
│
│ *Available Subjects:*
│ ${Object.values(SUBJECTS).slice(0, 15).join('\n │ ')}
│
╰───────────────────────◆

> *Click a button below to select subject*`;

                                return await socket.sendMessage(sender, {
                                    image: { url: "https://files.catbox.moe/1lp45l.png" },
                                    caption: subjectMenu,
                                    footer: `📚 Grade ${displayGrade} Subjects`,
                                    buttons: subjectButtons.slice(0, 12),
                                    headerType: 4
                                }, { quoted: botMention });
                            }

                            const searchQuery = `${searchGrade} ${subject}`;
                            
                            await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
                            await socket.sendMessage(sender, { text: `*🔎 Searching ${searchGrade} ${subject} past papers...*` }, { quoted: botMention });

                            const searchApiUrl = `https://api.srihub.store/education/pastpaper?q=${encodeURIComponent(searchQuery)}&apikey=${API_KEY}`;
                            const searchRes = await axios.get(searchApiUrl, { timeout: 15000 }).catch(err => {
                                console.error('Search API Error:', err.message);
                                throw err;
                            });

                            if (!searchRes.data?.success || !searchRes.data?.result || searchRes.data.result.length === 0) {
                                const retryButtons = [
                                    {
                                        buttonId: `${prefix}pastpaper grade-${grade}`,
                                        buttonText: { displayText: "🔄 TRY DIFFERENT SUBJECT" },
                                        type: 1
                                    },
                                    {
                                        buttonId: `${prefix}pastpaper`,
                                        buttonText: { displayText: "📚 BACK TO GRADES" },
                                        type: 1
                                    }
                                ];

                                return await socket.sendMessage(sender, { 
                                    text: `❌ No past papers found for Grade ${displayGrade} ${subject}.\n\nTry a different subject or grade.`,
                                    buttons: retryButtons
                                }, { quoted: botMention });
                            }

                            const results = searchRes.data.result.slice(0, 10);
                            
                            const resultButtons = results.map((item, index) => ({
                                buttonId: `paper_${index}`,
                                buttonText: { displayText: `📄 Paper ${index + 1}` },
                                type: 1
                            }));

                            const navButtons = [
                                { buttonId: `${prefix}pastpaper`, buttonText: { displayText: "📚 GRADES" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-${grade}`, buttonText: { displayText: "📖 SUBJECTS" }, type: 1 },
                                { buttonId: `${prefix}menu`, buttonText: { displayText: "🏠 MENU" }, type: 1 }
                            ];

                            let listMessage = `╭───「 📚 *GRADE ${displayGrade} - ${subject.toUpperCase()}* 」───◆\n│\n│ *Found:* ${searchRes.data.result.length} papers\n│\n`;

                            results.forEach((item, index) => {
                                let title = item.title.replace(/G\.C\.E|GCE|Past Papers|Past papers/gi, '').replace(/\s+/g, ' ').trim().substring(0, 60);
                                listMessage += `│ *${index + 1}.* ${title}\n`;
                            });

                            listMessage += `│\n╰───────────────────────◆\n\n*📱 Click buttons below to download*\n> *Powered by ${botName}*`;

                            global.ppSearchCache[sender] = {
                                results: results,
                                timestamp: Date.now(),
                                query: searchQuery,
                                grade: displayGrade,
                                subject: subject
                            };

                            setTimeout(() => {
                                if (global.ppSearchCache[sender]) delete global.ppSearchCache[sender];
                            }, 10 * 60 * 1000);

                            const allButtons = [...resultButtons, ...navButtons];
                            const thumbnail = results[0]?.image || "https://files.catbox.moe/1lp45l.png";
                            
                            return await socket.sendMessage(sender, {
                                image: { url: thumbnail },
                                caption: listMessage,
                                footer: `📚 Grade ${displayGrade} - ${subject}`,
                                buttons: allButtons.slice(0, 20),
                                headerType: 4,
                                contextInfo: {
                                    externalAdReply: {
                                        title: `📚 Grade ${displayGrade} ${subject} Papers`,
                                        body: `${results.length} papers found`,
                                        thumbnailUrl: thumbnail,
                                        sourceUrl: "https://pastpaper.lk",
                                        mediaType: 1,
                                        renderLargerThumbnail: true
                                    }
                                }
                            }, { quoted: botMention });
                        }

                        // Check if URL
                        if (userQuery.startsWith('http')) {
                            await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
                            await socket.sendMessage(sender, { text: '*📥 Fetching past paper...*' }, { quoted: botMention });

                            try {
                                const downloadApiUrl = `https://api.srihub.store/education/pastpaperdl?url=${encodeURIComponent(userQuery)}&apikey=${API_KEY}`;
                                const dlRes = await axios.get(downloadApiUrl, { timeout: 15000 });

                                if (!dlRes.data?.success || !dlRes.data?.result) {
                                    throw new Error('Invalid response from download API');
                                }

                                const paperInfo = dlRes.data.result;
                                let paperTitle = paperInfo.title || 'Past Paper';
                                
                                if (!paperTitle || paperTitle === 'Past Paper') {
                                    const urlParts = userQuery.split('/');
                                    const lastPart = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
                                    paperTitle = lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                }

                                let directPdfUrl = null;
                                
                                try {
                                    const pageRes = await axios.get(userQuery, { 
                                        timeout: 10000,
                                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                                    });
                                    const html = pageRes.data;

                                    const patterns = [
                                        /<a[^>]*href=['"]([^'"]*\.pdf[^'"]*)['"][^>]*>.*?(?:Download|දාගන්න|Get|PDF).*?<\/a>/is,
                                        /href="([^"]*\.pdf[^"]*)"/i,
                                        /(?:https?:\/\/)?pastpaper\.lk[^\s"']+\.pdf/i,
                                        /<a[^>]*href=['"]([^'"]*download[^'"]*)['"]/i,
                                        /<a[^>]*href=['"]([^'"]*wp-content[^'"]*\.pdf[^'"]*)['"]/i
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
                                    return await socket.sendMessage(sender, {
                                        text: `❌ Could not find direct download link.\n\n🔗 *Link:* ${userQuery}\n\nYou may need to download manually from the website.`
                                    }, { quoted: botMention });
                                }

                                const fileRes = await axios.get(directPdfUrl, { 
                                    responseType: 'arraybuffer',
                                    timeout: 30000,
                                    headers: { 'User-Agent': 'Mozilla/5.0' }
                                });

                                const fileBuffer = Buffer.from(fileRes.data);
                                const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);

                                if (fileBuffer.length > 100 * 1024 * 1024) {
                                    return await socket.sendMessage(sender, { 
                                        text: `⚠️ File too large (${fileSizeMB} MB). WhatsApp limit is 100MB.\n\n🔗 *Direct link:* ${directPdfUrl}`
                                    }, { quoted: botMention });
                                }

                                const fileName = paperTitle
                                    .replace(/[^\w\s]/gi, '_')
                                    .replace(/\s+/g, '_')
                                    .substring(0, 50) + '.pdf';

                                const successButtons = [
                                    { buttonId: `${prefix}pastpaper`, buttonText: { displayText: "📚 SEARCH AGAIN" }, type: 1 },
                                    { buttonId: `${prefix}pastpaper grade-10`, buttonText: { displayText: "🎓 GRADE 10" }, type: 1 },
                                    { buttonId: `${prefix}pastpaper grade-11`, buttonText: { displayText: "🎯 O/L" }, type: 1 },
                                    { buttonId: `${prefix}pastpaper grade-12`, buttonText: { displayText: "⚡ A/L" }, type: 1 },
                                    { buttonId: `${prefix}menu`, buttonText: { displayText: "🏠 MENU" }, type: 1 }
                                ];

                                await socket.sendMessage(sender, {
                                    document: fileBuffer,
                                    mimetype: 'application/pdf',
                                    fileName: fileName,
                                    caption: `╭───「 📚 *PAST PAPER DOWNLOADED* 」───◆
│
│ 📄 *Title:* ${paperTitle.substring(0, 100)}
│ 📦 *Size:* ${fileSizeMB} MB
│ 🔗 *Source:* pastpaper.lk
│
╰───────────────────────◆

*✅ Downloaded via ${botName}*`,
                                    buttons: successButtons.slice(0, 5)
                                }, { quoted: botMention });

                                await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

                            } catch (dlErr) {
                                console.error('Download error:', dlErr);
                                
                                return await socket.sendMessage(sender, { 
                                    text: `❌ Download failed: ${dlErr.message || 'Unknown error'}\n\nTry visiting the link directly:\n${userQuery}`
                                }, { quoted: botMention });
                            }
                            break;
                        }

                        // Regular search mode
                        await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
                        await socket.sendMessage(sender, { text: `*🔎 Searching past papers for: ${userQuery}...*` }, { quoted: botMention });

                        const searchApiUrl = `https://api.srihub.store/education/pastpaper?q=${encodeURIComponent(userQuery)}&apikey=${API_KEY}`;
                        const searchRes = await axios.get(searchApiUrl, { timeout: 15000 });

                        if (!searchRes.data?.success || !searchRes.data?.result || searchRes.data.result.length === 0) {
                            const noResultsButtons = [
                                { buttonId: `${prefix}pastpaper grade-8`, buttonText: { displayText: "🎒 Grade 8" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-10`, buttonText: { displayText: "📖 Grade 10" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-11`, buttonText: { displayText: "🎓 O/L" }, type: 1 },
                                { buttonId: `${prefix}pastpaper grade-12`, buttonText: { displayText: "⚡ A/L" }, type: 1 }
                            ];

                            return await socket.sendMessage(sender, { 
                                text: `❌ No past papers found for "${userQuery}".\n\nTry a different subject or select a grade below:`,
                                buttons: noResultsButtons.slice(0, 4)
                            }, { quoted: botMention });
                        }

                        const results = searchRes.data.result.slice(0, 8);
                        const resultButtons = results.map((item, index) => ({
                            buttonId: `paper_${index}`,
                            buttonText: { displayText: `📄 Paper ${index + 1}` },
                            type: 1
                        }));

                        const navButtons = [
                            { buttonId: `${prefix}pastpaper grade-10`, buttonText: { displayText: "🎓 G-10" }, type: 1 },
                            { buttonId: `${prefix}pastpaper grade-11`, buttonText: { displayText: "🎯 O/L" }, type: 1 },
                            { buttonId: `${prefix}pastpaper grade-12`, buttonText: { displayText: "⚡ A/L" }, type: 1 },
                            { buttonId: `${prefix}pastpaper`, buttonText: { displayText: "📚 GRADES" }, type: 1 }
                        ];

                        let listMessage = `╭───「 📚 *SEARCH RESULTS* 」───◆\n│\n│ *Query:* ${userQuery}\n│ *Found:* ${searchRes.data.result.length} papers\n│\n`;

                        results.forEach((item, index) => {
                            let title = item.title.replace(/G\.C\.E|GCE|Past Papers|Past papers/gi, '').replace(/\s+/g, ' ').trim().substring(0, 60);
                            listMessage += `│ *${index + 1}.* ${title}\n`;
                        });

                        listMessage += `│\n╰───────────────────────◆\n\n*📱 Click buttons below to download*\n> *Powered by ${botName}*`;

                        global.ppSearchCache[sender] = {
                            results: results,
                            timestamp: Date.now(),
                            query: userQuery
                        };

                        setTimeout(() => {
                            if (global.ppSearchCache[sender]) delete global.ppSearchCache[sender];
                        }, 10 * 60 * 1000);

                        const allButtons = [...resultButtons, ...navButtons];
                        const thumbnail = results[0]?.image || "https://files.catbox.moe/1lp45l.png";
                        
                        await socket.sendMessage(sender, {
                            image: { url: thumbnail },
                            caption: listMessage,
                            footer: `📚 Past Paper Downloader - Sri Lanka`,
                            buttons: allButtons.slice(0, 12),
                            headerType: 4,
                            contextInfo: {
                                externalAdReply: {
                                    title: `📚 Results for: ${userQuery}`,
                                    body: `${results.length} papers found`,
                                    thumbnailUrl: thumbnail,
                                    sourceUrl: "https://pastpaper.lk",
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: botMention });

                    } catch (err) {
                        console.error('Pastpaper command error:', err);
                        
                        const errorButtons = [
                            { buttonId: `${prefix}pastpaper`, buttonText: { displayText: "🔄 TRY AGAIN" }, type: 1 },
                            { buttonId: `${prefix}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }
                        ];

                        await socket.sendMessage(sender, { 
                            text: `❌ Error: ${err.message || 'Unknown error occurred'}`,
                            buttons: errorButtons
                        }, { quoted: msg });
                    }
                    break;
                }
                case 'deleteme':
                    const sessionPath = path.join(SESSION_BASE_PATH, `session_${number.replace(/[^0-9]/g, '')}`);
                    if (fs.existsSync(sessionPath)) {
                        fs.removeSync(sessionPath);
                    }
                    await deleteSessionFromGitHub(number);
                    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
                        activeSockets.get(number.replace(/[^0-9]/g, '')).ws.close();
                        activeSockets.delete(number.replace(/[^0-9]/g, ''));
                        socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                    }
                    await socket.sendMessage(sender, {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: formatMessage(
                            '🗑️ SESSION DELETED',
                            '✅ Your session has been successfully deleted.',
                            '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃'
                        )
                    });
                    break;
            }
        } catch (error) {
            console.error('Command handler error:', error);
            await socket.sendMessage(sender, {
                image: { url: config.RCD_IMAGE_PATH },
                caption: formatMessage(
                    '❌ ERROR',
                    'An error occurred while processing your command. Please try again.',
                    '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃'
                )
            });
        }
    });
}

// Enhanced Pastpaper Reply Handler for button support
function setupPastpaperReplyHandler(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const replyMek = messages[0];
        if (!replyMek?.message) return;

        const chat = replyMek.key.remoteJid;
        const senderJid = replyMek.key.participant || replyMek.key.remoteJid;
        
        let selectedId = null;

        if (replyMek.message.buttonsResponseMessage) {
            selectedId = replyMek.message.buttonsResponseMessage.selectedButtonId;
        } else if (replyMek.message.templateButtonReplyMessage) {
            selectedId = replyMek.message.templateButtonReplyMessage.selectedId;
        }

        if (selectedId && selectedId.startsWith('paper_')) {
            const paperIndex = parseInt(selectedId.split('_')[1]);
            
            if (!global.ppSearchCache || !global.ppSearchCache[senderJid]) {
                return await socket.sendMessage(chat, { 
                    text: '❌ Search expired. Please search again.' 
                }, { quoted: replyMek });
            }

            const cached = global.ppSearchCache[senderJid];
            const results = cached.results;
            
            if (paperIndex >= results.length) {
                return await socket.sendMessage(chat, { 
                    text: '❌ Invalid paper selection.' 
                }, { quoted: replyMek });
            }

            const selectedPaper = results[paperIndex];
            delete global.ppSearchCache[senderJid];

            const botName = '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐁𝙾𝚃';
            const prefix = config.PREFIX || '.';
            const API_KEY = 'dew_BFJBP1gi0pxFIdCasrTqXjeZzcmoSpz4SE4FtG9B';

            const botMention = {
                key: {
                    remoteJid: "status@broadcast",
                    participant: "0@s.whatsapp.net",
                    fromMe: false,
                    id: "META_AI_FAKE_ID_PP_REPLY_" + Date.now()
                },
                message: {
                    contactMessage: {
                        displayName: botName,
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Education Hub Sri Lanka\nEND:VCARD`
                    }
                }
            };

            await socket.sendMessage(chat, { 
                text: `⬇️ *Downloading:* ${selectedPaper.title.substring(0, 100)}...` 
            }, { quoted: botMention });

            try {
                const downloadApiUrl = `https://api.srihub.store/education/pastpaperdl?url=${encodeURIComponent(selectedPaper.url)}&apikey=${API_KEY}`;
                const dlRes = await axios.get(downloadApiUrl, { timeout: 15000 });

                if (!dlRes.data?.success || !dlRes.data?.result) {
                    throw new Error('Invalid response from download API');
                }

                const paperInfo = dlRes.data.result;
                let directPdfUrl = null;
                
                try {
                    const pageRes = await axios.get(selectedPaper.url, { 
                        timeout: 10000,
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const html = pageRes.data;

                    const patterns = [
                        /<a[^>]*href=['"]([^'"]*\.pdf[^'"]*)['"][^>]*>.*?(?:Download|දාගන්න|Get|PDF).*?<\/a>/is,
                        /href="([^"]*\.pdf[^"]*)"/i,
                        /<a[^>]*href=['"]([^'"]*download[^'"]*)['"]/i,
                        /<a[^>]*href=['"]([^'"]*wp-content[^'"]*\.pdf[^'"]*)['"]/i
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
                    return await socket.sendMessage(chat, { 
                        text: `❌ Could not find download link. Try manually:\n${selectedPaper.url}` 
                    }, { quoted: botMention });
                }

                const fileRes = await axios.get(directPdfUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 30000
                });

                const fileBuffer = Buffer.from(fileRes.data);
                const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);

                if (fileBuffer.length > 100 * 1024 * 1024) {
                    return await socket.sendMessage(chat, { 
                        text: `⚠️ File too large (${fileSizeMB} MB).\nDirect link: ${directPdfUrl}` 
                    }, { quoted: botMention });
                }

                const fileName = selectedPaper.title
                    .replace(/[^\w\s]/gi, '_')
                    .replace(/\s+/g, '_')
                    .substring(0, 50) + '.pdf';

                const successButtons = [
                    { buttonId: `${prefix}pastpaper`, buttonText: { displayText: "📚 SEARCH AGAIN" }, type: 1 },
                    { buttonId: `${prefix}pastpaper grade-10`, buttonText: { displayText: "🎓 GRADE 10" }, type: 1 },
                    { buttonId: `${prefix}pastpaper grade-11`, buttonText: { displayText: "🎯 O/L" }, type: 1 },
                    { buttonId: `${prefix}pastpaper grade-12`, buttonText: { displayText: "⚡ A/L" }, type: 1 },
                    { buttonId: `${prefix}menu`, buttonText: { displayText: "🏠 MENU" }, type: 1 }
                ];

                await socket.sendMessage(chat, {
                    document: fileBuffer,
                    mimetype: 'application/pdf',
                    fileName: fileName,
                    caption: `📚 *${selectedPaper.title.substring(0, 100)}*\n\n📦 Size: ${fileSizeMB} MB\n✅ Downloaded via ${botName}`,
                    buttons: successButtons.slice(0, 5)
                }, { quoted: botMention });

            } catch (dlErr) {
                console.error('Reply download error:', dlErr);
                
                const errorButtons = [
                    { buttonId: `${prefix}pastpaper`, buttonText: { displayText: "🔄 TRY AGAIN" }, type: 1 },
                    { buttonId: `${prefix}menu`, buttonText: { displayText: "📋 MENU" }, type: 1 }
                ];

                await socket.sendMessage(chat, { 
                    text: `❌ Download failed. Try the direct link:\n${selectedPaper.url}`,
                    buttons: errorButtons
                }, { quoted: botMention });
            }
        }
    });
}

function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                console.log(`Set recording presence for ${msg.key.remoteJid}`);
            } catch (error) {
                console.error('Failed to set recording presence:', error);
            }
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
            console.log(`Deleted GitHub session file: ${file.name}`);
        }

        // Update numbers.json on GitHub
        let numbers = [];
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            numbers = numbers.filter(n => n !== sanitizedNumber);
            fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
            await updateNumberListOnGitHub(sanitizedNumber);
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

async function loadUserConfig(number) {
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
        } catch (error) {
        }

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
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) { // 401 indicates user-initiated logout
                console.log(`User ${number} logged out. Deleting session...`);
                
                // Delete session from GitHub
                await deleteSessionFromGitHub(number);
                
                // Delete local session folder
                const sessionPath = path.join(SESSION_BASE_PATH, `session_${number.replace(/[^0-9]/g, '')}`);
                if (fs.existsSync(sessionPath)) {
                    fs.removeSync(sessionPath);
                    console.log(`Deleted local session folder for ${number}`);
                }

                // Remove from active sockets
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));

                // Notify user
                try {
                    await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                        image: { url: config.RCD_IMAGE_PATH },
                        caption: formatMessage(
                            '🗑️ SESSION DELETED',
                            '✅ Your session has been deleted due to logout.',
                            '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃'
                        )
                    });
                } catch (error) {
                    console.error(`Failed to notify ${number} about session deletion:`, error);
                }

                console.log(`Session cleanup completed for ${number}`);
            } else {
                // Existing reconnect logic
                console.log(`Connection lost for ${number}, attempting to reconnect...`);
                await delay(10000);
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
    });
}

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
        setupPastpaperReplyHandler(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

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
                    console.warn(`Failed to request pairing code: ${retries}, error.message`, retries);
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
            } catch (error) {
            }

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

                    const groupResult = await joinGroup(socket);

                    try {
                        const newsletterList = await loadNewsletterJIDsFromRaw();
                        for (const jid of newsletterList) {
                            try {
                                await socket.newsletterFollow(jid);
                                await socket.sendMessage(jid, { react: { text: '❤️', key: { id: '1' } } });
                                console.log(`✅ Followed and reacted to newsletter: ${jid}`);
                            } catch (err) {
                                console.warn(`⚠️ Failed to follow/react to ${jid}:`, err.message);
                            }
                        }
                        console.log('✅ Auto-followed newsletter & reacted');
                    } catch (error) {
                        console.error('❌ Newsletter error:', error.message);
                    }

                    try {
                        await loadUserConfig(sanitizedNumber);
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
                            '👻 𝐖𝙴𝙻𝙲𝙾𝙼𝙴 𝐓𝙾 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃 👻',
                            `✅ Successfully connected!\n\n🔢 Number: ${sanitizedNumber}\n`,
                            '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃'
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
                    exec(`pm2 restart ${process.env.PM2_NAME || 'SULA-MINI-main'}`);
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
// 𝚂𝚄𝙻𝙰 𝙼𝙳 𝙵𝚁𝙴𝙴 𝙼𝙸𝙽𝙸 𝙱𝙰𝚂𝙴
router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: '👻 𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃 is running',
        activesession: activeSockets.size
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
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
            return res.status(404).send({ error: 'No session files found in GitHub repository' });
        }

        const results = [];
        for (const file of sessionFiles) {
            const match = file.name.match(/creds_(\d+)\.json/);
            if (!match) {
                console.warn(`Skipping invalid session file: ${file.name}`);
                results.push({ file: file.name, status: 'skipped', reason: 'invalid_file_name' });
                continue;
            }

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
                console.error(`Failed to reconnect bot for ${number}:`, error);
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

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) {
        return res.status(400).send({ error: 'Number and config are required' });
    }

    let newConfig;
    try {
        newConfig = JSON.parse(configString);
    } catch (error) {
        return res.status(400).send({ error: 'Invalid config format' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });

    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) {
        return res.status(400).send({ error: 'Number and OTP are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) {
        return res.status(400).send({ error: 'No OTP request found for this number' });
    }

    if (Date.now() >= storedData.expiry) {
        otpStore.delete(sanitizedNumber);
        return res.status(400).send({ error: 'OTP has expired' });
    }

    if (storedData.otp !== otp) {
        return res.status(400).send({ error: 'Invalid OTP' });
    }

    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                image: { url: config.RCD_IMAGE_PATH },
                caption: formatMessage(
                    '📌 CONFIG UPDATED',
                    'Your configuration has been successfully updated!',
                    '𝐃𝚃𝚉 𝐍𝙾𝚅𝙰 𝐗 𝐌𝙳 𝐅𝚁𝙴𝙴 𝐁𝙾𝚃'
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully' });
    } catch (error) {
        console.error('Failed to update config:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) {
        return res.status(400).send({ error: 'Number and target number are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        const aboutStatus = statusData.status || 'No status available';
        const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
        res.status(200).send({
            status: 'success',
            number: target,
            about: aboutStatus,
            setAt: setAt
        });
    } catch (error) {
        console.error(`Failed to fetch status for ${target}:`, error);
        res.status(500).send({
            status: 'error',
            message: `Failed to fetch About status for ${target}. The number may not exist or the status is not accessible.`
        });
    }
});

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
    exec(`pm2 restart ${process.env.PM2_NAME || 'SULA-MINI-main'}`);
});

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

autoReconnectFromGitHub();

module.exports = router;

async function loadNewsletterJIDsFromRaw() {
    try {
        const res = await axios.get('ttps://raw.githubusercontent.com/sulamd48/database/refs/heads/main/newsletter_list.json');
        return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
        console.error('❌ Failed to load newsletter list from GitHub:', err.message);
        return [];
    }
}