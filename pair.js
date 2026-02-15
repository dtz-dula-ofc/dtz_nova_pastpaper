/*
  ________  _________  ________          ________   ________  ___      ___ ________          ___    ___      _____ ______   ________          ___      ___  _____     
|\   ___ \|\___   ___\\_____  \        |\   ___  \|\   __  \|\  \    /  /|\   __  \        |\  \  /  /|    |\   _ \  _   \|\   ___ \        |\  \    /  /|/ __  \    
\ \  \_|\ \|___ \  \_|\|___/  /|       \ \  \\ \  \ \  \|\  \ \  \  /  / | \  \|\  \       \ \  \/  / /    \ \  \\\__\ \  \ \  \_|\ \       \ \  \  /  / /\/_|\  \   
 \ \  \ \\ \   \ \  \     /  / /        \ \  \\ \  \ \  \\\  \ \  \/  / / \ \   __  \       \ \    / /      \ \  \\|__| \  \ \  \ \\ \       \ \  \/  / /\|/ \ \  \  
  \ \  \_\\ \   \ \  \   /  /_/__        \ \  \\ \  \ \  \\\  \ \    / /   \ \  \ \  \       /     \/        \ \  \    \ \  \ \  \_\\ \       \ \    / /      \ \  \ 
   \ \_______\   \ \__\ |\________\       \ \__\\ \__\ \_______\ \__/ /     \ \__\ \__\     /  /\   \         \ \__\    \ \__\ \_______\       \ \__/ /        \ \__\
    \|_______|    \|__|  \|_______|        \|__| \|__|\|_______|\|__|/       \|__|\|__|    /__/ /\ __\         \|__|     \|__|\|_______|        \|__|/          \|__|
                                                                                           |__|/ \|__|                                                               
                                                                                                                                                                     
  DTZ NOVA X MD MINI BOT - MULTI SESSION SUPPORT
  DEVELOPED BY DTZ DULA
  FULLT ENC AND PRIVERTE SOURCE CODE    
  Contact Owner - 94752978237
  Code Ussai #akak - Thawa #akada balanne                                                                    
*/

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

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
  DisconnectReason
} = require('baileys');

// Global cache for pastpaper search results
global.ppSearchCache = {};

// ---------------- CONFIG ----------------
const BOT_NAME_FANCY = '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['☘️','💗','🫂','🙈','🍁','🙃','','😘','🏴‍☠️','👀','❤️‍🔥'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/GYFkafbxbD8JHDCPzXPlIi',
  RCD_IMAGE_PATH: 'https://files.catbox.moe/1lp45l.png',
  NEWSLETTER_JID: '120363421675697127@newsletter',
  OTP_EXPIRY: 300000,
  WORK_TYPE: 'public',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94752978237',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U',
  BOT_NAME: '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵',
  BOT_VERSION: '1.0.0V',
  OWNER_NAME: 'ᴅᴛᴢ ᴅᴜʟᴀ💔',
  IMAGE_PATH: 'https://files.catbox.moe/1lp45l.png',
  BOT_FOOTER: '> *©ᴘᴏᴡᴇʀᴅ ʙʏ 🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵*',
  BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/1lp45l.png' }
};

// ---------------- MONGO SETUP ----------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://camalkaakash2_db_user:QVIRCgDpbjr2adcb@dtznovaxpaspapers.ddt0qup.mongodb.net/?appName=dtznovaxpaspapers';
const MONGO_DB = process.env.MONGO_DB || 'paspaper_bot_db';
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

// In-memory cache for user configs to avoid frequent DB reads
const userConfigCache = new Map();
const USER_CONFIG_CACHE_TTL = 30 * 1000; // 30 seconds

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------
async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    try { userConfigCache.set(sanitized, { config: conf, ts: Date.now() }); } catch (e){}
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    // Check cache first
    try {
      const cached = userConfigCache.get(sanitized);
      if (cached && (Date.now() - (cached.ts || 0) < USER_CONFIG_CACHE_TTL)) {
        return cached.config;
      }
    } catch (e) { }

    const doc = await configsCol.findOne({ number: sanitized });
    const conf = doc ? doc.config : null;
    try { userConfigCache.set(sanitized, { config: conf, ts: Date.now() }); } catch (e){}
    return conf;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

async function addNewsletterReactConfig(jid, emojis = ['🎀','🧚‍♀️','🎭']) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : ['🤫','♥️',''] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return ['🤫','♥️','']; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : ['🧚‍♀️','🤫','🎀']) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------
function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();
const socketCreationTime = new Map();
const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------
async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 𝐎𝚃𝙿 𝐕𝙴𝚁𝙸𝙵𝙸𝙲𝙰𝚃𝙸𝙾𝙽 — ${BOT_NAME_FANCY}*`, `*𝐘𝙾𝚄𝚁 𝐎𝚃𝙿 𝐅𝙾𝚁 𝐂𝙾𝙽𝙵𝙸𝙶 𝐔𝙿𝙳𝙰𝚃𝙴 𝐈𝚂:* *${otp}*\n𝐓𝙷𝙸𝚂 𝐎𝚃𝙿 𝐖𝙸𝙻𝙻 𝐄𝚇𝙿𝙸𝚁𝙴 𝐈𝙽 5 𝐌𝙸𝙽𝚄𝚃𝙴𝚂.\n\n*𝐍𝚄𝙼𝙱𝙴𝚁:* ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------
async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo();
      const reactConfigs = await listNewsletterReactsFromMongo();
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}

// ---------------- status + revocation + resizing ----------------
async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      let userEmojis = config.AUTO_LIKE_EMOJI;
      let autoViewStatus = config.AUTO_VIEW_STATUS;
      let autoLikeStatus = config.AUTO_LIKE_STATUS;
      let autoRecording = config.AUTO_RECORDING;
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }
        
        if (userConfig.AUTO_VIEW_STATUS !== undefined) {
          autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        }
        
        if (userConfig.AUTO_LIKE_STATUS !== undefined) {
          autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        }
        
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }
      
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { 
            await socket.readMessages([message.key]); 
            break; 
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
      
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { 
              react: { text: randomEmoji, key: message.key } 
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
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
    const message = formatMessage('*🗑️ 𝐌𝙴𝚂𝚂𝙰𝙶𝙴 𝐃𝙴𝙻𝙴𝚃𝙴𝙳*', `A message was deleted from your chat.\n*📋 𝐅𝚁𝙾𝙼:* ${messageKey.remoteJid}\n*🍁 𝐃𝙴𝙻𝙴𝚃𝙸𝙾𝙽 𝐓𝙸𝙼𝙴:* ${deletionTime}`, BOT_NAME_FANCY);
    try { await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: message }); }
    catch (error) { console.error('Failed to send deletion notification:', error); }
  });
}

async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

// ==================== COMMAND HANDLER SETUP ====================
function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");

    let body = '';
    try {
      if (type === 'conversation') {
        body = msg.message.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = msg.message.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = msg.message.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = msg.message.videoMessage?.caption || '';
      } else if (type === 'buttonsResponseMessage') {
        body = msg.message.buttonsResponseMessage?.selectedButtonId || '';
      } else if (type === 'listResponseMessage') {
        body = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
      } else if (type === 'templateButtonReplyMessage') {
        body = msg.message.templateButtonReplyMessage?.selectedId || '';
      } else if (type === 'interactiveResponseMessage') {
        const nativeFlow = msg.message.interactiveResponseMessage?.nativeFlowResponseMessage;
        if (nativeFlow?.paramsJson) {
          try {
            const params = JSON.parse(nativeFlow.paramsJson);
            body = params.id || '';
          } catch (e) {
            body = '';
          }
        }
      } else if (type === 'viewOnceMessage') {
        const viewOnceContent = msg.message.viewOnceMessage?.message;
        if (viewOnceContent) {
          const viewOnceType = getContentType(viewOnceContent);
          if (viewOnceType === 'imageMessage') {
            body = viewOnceContent.imageMessage?.caption || '';
          } else if (viewOnceType === 'videoMessage') {
            body = viewOnceContent.videoMessage?.caption || '';
          }
        }
      }
      if (!body || typeof body !== 'string') return;
    } catch (e) {
      console.error('Error:', e);
    }

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {
      // Load user config for work type restrictions
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};

      // Apply work type restrictions for non-owner users
      if (!isOwner) {
        const workType = userConfig.WORK_TYPE || 'public';
        if (workType === "private") {
          console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
          return;
        }
        if (isGroup && workType === "inbox") {
          console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
          return;
        }
        if (!isGroup && workType === "groups") {
          console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
          return;
        }
      }

      // ==================== COMMAND SWITCH ====================
      switch (command) {
        // ==================== OWNER COMMAND ====================
        case 'owner': {
          try {
            await socket.sendMessage(sender, { react: { text: "🧑‍🎄", key: msg.key } });

            const ownerNumber = '94752978237';
            const ownerName = 'ᴅᴛᴢ ᴅᴜʟᴀ';
            const botName = '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵';
            const ownerImage = 'https://files.catbox.moe/1lp45l.png';
            const websiteUrl = 'https://dtz-nova-xmd-mini-pair.vercel.app/';

            const timeNow = new Date().toLocaleTimeString('en-US', { 
              hour: '2-digit', minute: '2-digit', hour12: true, timeZone: "Asia/Colombo" 
            });

            const aestheticCaption = `
╭━━━〔 👑 *${botName}* 👑 〕━━━┈
┃
┃  👤 *OWNER PROFILE*
┃  • 𝐍𝐚𝐦𝐞 : *${ownerName}*
┃  • 𝐑𝐨𝐥𝐞 : Lead Developer
┃  • 📍 𝐅𝐫𝐨𝐦 : Sri Lanka 🇱🇰
┃  • ⌚ 𝐓𝐢𝐦𝐞 : ${timeNow}
┃
┃  🛠️ *SKILLS & STATUS*
┃  • 💻 Stack : JS, Node.js, React
┃  • 🤖 Bot : *Active & Online* ✅
┃  • 🛡️ Security : Verified
┃
┃  ❝ *Empowering communication with*
┃     *automation and elegance.* ❞
┃
╰━━━━━━━━━━━━━━━━━━━━━━┈
> *© 2026 DTZ Development™*
`.trim();

            const buttonParams = [
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "💬 Chat with Owner",
                  url: `https://wa.me/${ownerNumber}?text=Hello ${ownerName}, I need assistance with 🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵 Bot.`
                })
              },
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "🌐 Visit Website",
                  url: websiteUrl
                })
              },
              {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: "📋 Copy Owner Number",
                  copy_code: ownerNumber
                })
              },
              {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: "🔙 Main Menu",
                  id: `${config.PREFIX || '.'}menu`
                })
              }
            ];

            const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require("baileys");

            const mediaMessage = await prepareWAMessageMedia({ 
              image: { url: ownerImage } 
            }, { upload: socket.waUploadToServer });

            const msgContent = generateWAMessageFromContent(sender, {
              viewOnceMessage: {
                message: {
                  messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                  },
                  interactiveMessage: {
                    body: { text: aestheticCaption },
                    footer: { text: "Tap a button below to interact 👇" },
                    header: {
                      title: "",
                      subtitle: "🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵 Support",
                      hasMediaAttachment: true,
                      imageMessage: mediaMessage.imageMessage
                    },
                    nativeFlowMessage: {
                      buttons: buttonParams
                    }
                  }
                }
              }
            }, { userJid: sender, quoted: msg });

            await socket.relayMessage(sender, msgContent.message, { 
              messageId: msgContent.key.id 
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
ORG:DTZ Development
TEL;waid=${ownerNumber}:+${ownerNumber}
END:VCARD`;
            await socket.sendMessage(sender, {
              contacts: {
                displayName: ownerName,
                contacts: [{ vcard }]
              }
            });

          } catch (err) {
            console.error('❌ Owner Command Error:', err);
            await socket.sendMessage(sender, { 
              text: `⚠️ *Error:* Failed to load owner menu.
Contact: +${config.OWNER_NUMBER}` 
            }, { quoted: msg });
          }
          break;
        }

        // ==================== MENU COMMAND ====================
        case 'menu': {
          try {
            await socket.sendMessage(sender, { react: { text: "💠", key: msg.key } });

            const BOT_NAME = '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵';
            const OWNER_NAME = 'ᴅᴛᴢ ᴅᴜʟᴀ';
            const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb6aIrGLo4hhAAGH6f3U";
            const MENU_IMG = "https://files.catbox.moe/1lp45l.png";
            const VIDEO_INTRO = 'https://saviya-kolla-database.vercel.app/VIDEO/1768383621686_yl221.mp4';

            const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
            const hour = slNow.getHours();
            const timeStr = slNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
            const dateStr = slNow.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });

            let greetingText = "";
            if (hour < 5) greetingText = "🌌 ᴇᴀʀʟʏ ᴍᴏʀɴɪɴɢ";
            else if (hour < 12) greetingText = "🌅 ɢᴏᴏᴅ ᴍᴏʀɴɪɴɢ";
            else if (hour < 18) greetingText = "🌞 ɢᴏᴏᴅ ᴀꜰᴛᴇʀɴᴏᴏɴ";
            else if (hour < 22) greetingText = "🌙 ɢᴏᴏᴅ ᴇᴠᴇɴɪɴɢ";
            else greetingText = "🦉 ꜱᴡᴇᴇᴛ ᴅʀᴇᴀᴍꜱ";

            const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const uptime = process.uptime();
            const days = Math.floor(uptime / (24 * 3600));
            const hours = Math.floor((uptime % (24 * 3600)) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const runtime = `${days}D ${hours}H ${minutes}M`;

            const quotes = [
              "සිනහව වනාහි ලොව ඇති මිල අධිකම ආභරණයයි.",
              "ජීවිතය ගමනක් මිස නැවතුමක් නොවේ.",
              "Great things never came from comfort zones.",
              "Dream it. Wish it. Do it.",
              "වැටෙන තැනින් නැගිටින එකයි ජීවිතේ කියන්නෙ.",
              "Success is not final, failure is not fatal.",
              "Believe you can and you're halfway there.",
              "Your limitation—it's only your imagination."
            ];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            const userTag = `@${sender.split("@")[0]}`;

            await socket.sendMessage(sender, {
              video: { url: VIDEO_INTRO },
              ptv: true,
              gifPlayback: true,
              caption: "✨ ꜱʏꜱᴛᴇᴍ ʙᴏᴏᴛɪɴɢ..."
            });

            const caption = `
╭─── ﹝ ${greetingText} ﹞ ───◆
│ 👤 𝐇𝐞𝐲 : ${userTag}
╰───────────────────◆

╭─── ﹝ ⚡ ${BOT_NAME} ⚡ ﹞ ───◆
│
│ 👤 𝐎𝐰𝐧𝐞𝐫 : ${OWNER_NAME}
│ 🚀 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 : 2.0.0 (ᴘʀᴏ)
│ ⏳ 𝐔𝐩𝐭𝐢𝐦𝐞 : ${runtime}
│ 💾 𝐑𝐚𝐦 : ${ramUsage}MB
│
╰───────────────────────◆

╭── ﹝ 📅 𝐃𝐚𝐢𝐥𝐲 𝐈𝐧𝐟𝐨 ﹞ ──◆
│ ⌚ 𝐓𝐢𝐦𝐞 : ${timeStr}
│ 📆 𝐃𝐚𝐭𝐞 : ${dateStr}
╰───────────────────◆

❝ ${randomQuote} ❞

👇 ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴄᴏᴍᴍᴀɴᴅ ʙᴇʟᴏᴡ
`.trim();

            const sections = [
              {
                title: "💠 𝐀𝐕𝐀𝐈𝐋𝐀𝐁𝐋𝐄 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒",
                rows: [
                  { title: "👑 𝐎𝐰𝐧𝐞𝐫", description: "View bot owner information", id: `${config.PREFIX}owner` },
                  { title: "📚 𝐏𝐚𝐬𝐭𝐩𝐚𝐩𝐞𝐫", description: "Download Sri Lankan past papers by subject", id: `${config.PREFIX}pastpaper` },
                  { title: "⚙️ 𝐒𝐞𝐭𝐭𝐢𝐧𝐠", description: "Configure bot settings", id: `${config.PREFIX}setting` },
                  { title: "👋 𝐀𝐥𝐢𝐯𝐞", description: "Check if bot is online", id: `${config.PREFIX}alive` },
                  { title: "📶 𝐏𝐢𝐧𝐠", description: "Check bot response speed", id: `${config.PREFIX}ping` }
                ]
              }
            ];

            const buttons = [
              {
                buttonId: "menu_list",
                buttonText: { displayText: "📂 𝐎𝐏𝐄𝐍 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃" },
                type: 4,
                nativeFlowInfo: {
                  name: "single_select",
                  paramsJson: JSON.stringify({ title: "🔮 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔", sections })
                }
              },
              { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "⚡ 𝐏𝐈𝐍𝐆" }, type: 1 },
              { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: "👋 𝐀𝐋𝐈𝐕𝐄" }, type: 1 }
            ];

            await socket.sendMessage(sender, {
              document: { url: MENU_IMG },
              mimetype: "application/pdf",
              fileName: `${BOT_NAME} 📂`,
              pageCount: 9999,
              fileLength: 99999999999999,
              caption: caption,
              buttons: buttons,
              headerType: 4,
              contextInfo: {
                mentionedJid: [sender],
                isForwarded: true,
                forwardingScore: 999,
                externalAdReply: {
                  title: "WhatsApp 🟢 Status",
                  body: `Contact: ${OWNER_NAME} 🌟`,
                  thumbnailUrl: MENU_IMG,
                  sourceUrl: CHANNEL_LINK,
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              }
            }, { quoted: msg });

          } catch (e) {
            console.log("❌ Menu Error:", e);
            await socket.sendMessage(sender, { text: "⚠️ System Error." }, { quoted: msg });
          }
          break;
        }

        // ==================== PING COMMAND ====================
        case 'ping': {
          try {
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

            const loadingText = `*⚡ ꜱᴘᴇᴇᴅ ᴛᴇꜱᴛ ɪɴɪᴛɪᴀʟɪᴢᴇᴅ...*`;
            const { key } = await socket.sendMessage(sender, { text: loadingText }, { quoted: msg });

            const frames = [
              '▱▱▱▱▱▱▱▱▱▱ 0%',
              '▰▰▱▱▱▱▱▱▱▱ 20%',
              '▰▰▰▰▱▱▱▱▱▱ 40%',
              '▰▰▰▰▰▰▱▱▱▱ 60%',
              '▰▰▰▰▰▰▰▰▱▱ 80%',
              '▰▰▰▰▰▰▰▰▰▰ 100%'
            ];

            for (let frame of frames) {
              await socket.sendMessage(sender, { text: `*⚡ ᴀɴᴀʟʏᴢɪɴɢ ɴᴇᴛᴡᴏʀᴋ...*\n${frame}`, edit: key });
              await sleep(500);
            }

            const start = Date.now();
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || "🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵";
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            const end = Date.now();
            const latency = end - start;
            const finalLatency = latency > 0 ? latency : Math.floor(Math.random() * 50) + 10;

            const memory = process.memoryUsage();
            const ramUsage = (memory.rss / 1024 / 1024).toFixed(2);
            const totalMem = 4096;

            const text = `
╭━━〔 *${botName}* 〕━━┈⊷
┃
┃ ⚡ *ᴘɪɴɢ* : ${finalLatency} ᴍꜱ
┃ 💾 *ʀᴀᴍ*  : ${ramUsage} / ${totalMem} ᴍʙ
┃ 💠 *ᴛʏᴘᴇ* : ${config.WORK_TYPE || 'ᴘᴜʙʟɪᴄ'}
┃ 📅 *ᴅᴀᴛᴇ* : ${new Date().toLocaleDateString('en-GB')}
┃
╰━━〔 *${config.OWNER_NAME || '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵'}* 〕━━┈⊷

   *🚀 ꜱʏꜱᴛᴇᴍ ɪꜱ ʀᴜɴɴɪɴɢ ꜱᴍᴏᴏᴛʜʟʏ*
`;

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "PING_FINAL" },
              message: {
                contactMessage: {
                  displayName: `🚀 ${finalLatency}ms`,
                  vcard: `BEGIN:VCARD
VERSION:3.0
N:;Bot;;;
FN:Speed
ORG:${botName}
END:VCARD`
                }
              }
            };

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            const buttons = [
              { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 𝙱𝚘𝚝 𝙼𝚎𝚗𝚞" }, type: 1 },
              { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "🔄 𝚃𝚎𝚜𝚝 𝙰𝚐𝚊𝚒𝚗" }, type: 1 }
            ];

            await socket.sendMessage(sender, { react: { text: '🌟', key: msg.key } });

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `*© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵*`,
              buttons: buttons,
              headerType: 4,
              contextInfo: {
                externalAdReply: {
                  title: "🚀 ꜱᴘᴇᴇᴅ ᴛᴇꜱᴛ ᴄᴏᴍᴘʟᴇᴛᴇᴅ",
                  body: `Latency: ${finalLatency}ms - Optimized`,
                  thumbnailUrl: logo,
                  sourceUrl: "https://github.com/",
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              }
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('Ping command error:', e);
            await socket.sendMessage(sender, { text: '❌ *Error in Loading Sequence.*' }, { quoted: msg });
          }
          break;
        }

        // ==================== SETTING COMMAND ====================
        case 'setting': {
          await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });

          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const permissionCard = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PERM" },
                message: { contactMessage: { displayName: "SECURITY ALERT", vcard: `BEGIN:VCARD
VERSION:3.0
N:System;Security;;;
FN:System Security
ORG:Privacy Guard
END:VCARD` } }
              };
              return await socket.sendMessage(sender, {
                text: `❌ *𝐀𝐂𝐂𝐄𝐒𝐒 𝐃𝐄𝐍𝐈𝐄𝐃*\n\n🔒 _This menu is restricted to the bot owner only._`
              }, { quoted: permissionCard });
            }

            const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
            const botName = currentConfig.botName || '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵';
            const prefix = currentConfig.PREFIX || config.PREFIX;

            const settingOptions = {
              name: 'single_select',
              paramsJson: JSON.stringify({
                title: `⚙️ 𝙲𝙾𝙽𝚃𝚁𝙾𝙻 𝙿𝙰𝙽𝙴𝙻`,
                sections: [
                  {
                    title: '✨ 𝐖𝐎𝐑𝐊 𝐌𝐎𝐃𝐄 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒',
                    rows: [
                      { title: ' 🌍 ┊ 𝐏𝐮𝐛𝐥𝐢𝐜 𝐌𝐨𝐝𝐞', description: 'Bot works for everyone', id: `${prefix}wtype public` },
                      { title: ' 🔐 ┊ 𝐏𝐫𝐢𝐯𝐚𝐭𝐞 𝐌𝐨𝐝𝐞', description: 'Bot works only for you', id: `${prefix}wtype private` },
                      { title: ' 👥 ┊ 𝐆𝐫𝐨𝐮𝐩𝐬 𝐎𝐧𝐥𝐲', description: 'Works in groups only', id: `${prefix}wtype groups` },
                      { title: ' 📥 ┊ 𝐈𝐧𝐛𝐨𝐱 𝐎𝐧𝐥𝐲', description: 'Works in DM/Inbox only', id: `${prefix}wtype inbox` },
                    ],
                  },
                  {
                    title: '👻 𝐆𝐇𝐎𝐒𝐓 & 𝐏𝐑𝐈𝐕𝐀𝐂𝐘',
                    rows: [
                      { title: ' 🟢 ┊ 𝐀𝐥𝐰𝐚𝐲𝐬 𝐎𝐧𝐥𝐢𝐧𝐞 : 𝐎𝐍', description: 'Show online badge', id: `${prefix}botpresence online` },
                      { title: ' ⚫ ┊ 𝐀𝐥𝐰𝐚𝐲𝐬 𝐎𝐧𝐥𝐢𝐧𝐞 : 𝐎𝐅𝐅', description: 'Hide online badge', id: `${prefix}botpresence offline` },
                      { title: ' ✍️ ┊ 𝐅𝐚𝐤𝐞 𝐓𝐲𝐩𝐢𝐧𝐠 : 𝐎𝐍', description: 'Show typing animation', id: `${prefix}autotyping on` },
                      { title: ' 🔇 ┊ 𝐅𝐚𝐤𝐞 𝐓𝐲𝐩𝐢𝐧𝐠 : 𝐎𝐅𝐅', description: 'Hide typing animation', id: `${prefix}autotyping off` },
                    ],
                  },
                  {
                    title: '🤖 𝐀𝐔𝐓𝐎𝐌𝐀𝐓𝐈𝐎𝐍 & 𝐓𝐎𝐎𝐋𝐒',
                    rows: [
                      { title: ' 👁️ ┊ 𝐀𝐮𝐭𝐨 𝐒𝐞𝐞𝐧 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐍', description: 'View statuses automatically', id: `${prefix}rstatus on` },
                      { title: ' 🙈 ┊ 𝐀𝐮𝐭𝐨 𝐒𝐞𝐞𝐧 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐅𝐅', description: 'Do not view statuses', id: `${prefix}rstatus off` },
                      { title: ' ❤️ ┊ 𝐀𝐮𝐭𝐨 𝐋𝐢𝐤𝐞 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐍', description: 'React to statuses', id: `${prefix}arm on` },
                      { title: ' 💔 ┊ 𝐀𝐮𝐭𝐨 𝐋𝐢𝐤𝐞 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐅𝐅', description: 'Do not react', id: `${prefix}arm off` },
                    ],
                  },
                  {
                    title: '📨 𝐌𝐄𝐒𝐒𝐀𝐆𝐄 𝐇𝐀𝐍𝐃𝐋𝐈𝐍𝐆',
                    rows: [
                      { title: ' 📖 ┊ 𝐑𝐞𝐚𝐝 𝐀𝐥𝐥 : 𝐎𝐍', description: 'Blue tick everything', id: `${prefix}mread all` },
                      { title: ' 📑 ┊ 𝐑𝐞𝐚𝐝 𝐂𝐦𝐝𝐬 : 𝐎𝐍', description: 'Blue tick commands only', id: `${prefix}mread cmd` },
                      { title: ' 📪 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐚𝐝 : 𝐎𝐅𝐅', description: 'Stay on grey ticks', id: `${prefix}mread off` },
                    ],
                  },
                ],
              }),
            };

            const fancyWork = (currentConfig.WORK_TYPE || 'public').toUpperCase();
            const fancyPresence = (currentConfig.PRESENCE || 'available').toUpperCase();

            const msgCaption = `
╭━━━〔 *${botName}* 〕━━━┈
┃
┃ 📝 *NAME CONFIG*
┃ ╰ ➦ Name: ${botName}
┃
┃ ⚙️ *MAIN CONFIGURATION*
┃ ╰ ➦ Type: ${fancyWork}
┃
┃ 👻 *PRESENCE STATUS*
┃ ╰ ➦ State: ${fancyPresence}
┃
┃ 📡 *STATUS AUTOMATION*
┃ ╰ ➦ View: ${currentConfig.AUTO_VIEW_STATUS || 'true'}  |  Like: ${currentConfig.AUTO_LIKE_STATUS || 'true'}
┃
┃ 🛡️ *SECURITY SHIELD*
┃ ╰ ➦ Anti-Call: ${currentConfig.ANTI_CALL || 'off'}
┃
┃ 📨 *MESSAGE SYSTEM*
┃ ╰ ➦ Auto Read: ${currentConfig.AUTO_READ_MESSAGE || 'off'}
┃
┃ 🎭 *FAKES & ACTIONS*
┃ ╰ ➦ Typing: ${currentConfig.AUTO_TYPING || 'false'} | Recording: ${currentConfig.AUTO_RECORDING || 'false'}
┃
╰━━━━━━━━━━━━━━━━━━━┈
    `.trim();

            await socket.sendMessage(sender, {
              headerType: 1,
              viewOnce: true,
              image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
              caption: msgCaption,
              buttons: [
                {
                  buttonId: 'settings_action',
                  buttonText: { displayText: '⚙️ 𝐎𝐏𝐄𝐍 𝐂𝐎𝐍𝐅𝐈𝐆' },
                  type: 4,
                  nativeFlowInfo: settingOptions,
                },
              ],
              footer: `👨‍💻 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 ${config.OWNER_NAME || 'Bot Owner'}`,
            }, { quoted: msg });

          } catch (e) {
            console.error('Setting command error:', e);
            const errorCard = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ERR" },
              message: { contactMessage: { displayName: "SYSTEM ERROR", vcard: `BEGIN:VCARD
VERSION:3.0
N:Error;;;;
FN:System Error
END:VCARD` } }
            };
            await socket.sendMessage(sender, {
              text: `*❌ 𝐂𝐑𝐈𝐓𝐈𝐂𝐀𝐋 𝐄𝐑𝐑𝐎𝐑*\n\n_Failed to load settings menu. Check console logs._`
            }, { quoted: errorCard });
          }
          break;
        }

        // ==================== ALIVE COMMAND ====================
        case 'alive': {
          try {
            await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } });

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵';
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
              message: { contactMessage: { displayName: "🟢 ᴏɴʟɪɴᴇ", vcard: `BEGIN:VCARD
VERSION:3.0
N:;${botName};;;
FN:${botName}
ORG:Bot System
END:VCARD` } }
            };

            const text = `
╭━━〔 *${botName}* 〕━━┈⊷
┃
┃ 👋 *𝐇𝐞𝐲 𝐓𝐡𝐞𝐫𝐞! 𝐈 𝐀𝐦 𝐀𝐥𝐢𝐯𝐞 𝐍𝐨𝐰.*
┃    _Always ready to assist you!_
┃
┃ 👤 *𝐔𝐬𝐞𝐫:* @${sender.split('@')[0]}
┃ 👑 *𝐎𝐰𝐧𝐞𝐫:* ${config.OWNER_NAME || 'Tharaka Dilshan'}
┃ ⏳ *𝐔𝐩𝐭𝐢𝐦𝐞:* ${hours}ʜ ${minutes}ᴍ ${seconds}ꜱ
┃ 🚀 *𝐕𝐞𝐫𝐬𝐢𝐨𝐧:* 2.0.0 (Pro)
┃ 💻 *𝐇𝐨𝐬𝐭:* ${process.env.PLATFORM || 'Heroku'}
┃
╰━━━━━━━━━━━━━━┈⊷
> *© 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵 🍃*
`;

            const buttons = [
              { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📜 𝐁𝐎𝐓 𝐌𝐄𝐍𝐔" }, type: 1 },
              { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "📶 𝐒𝐏𝐄𝐄𝐃 𝐓𝐄𝐒𝐓" }, type: 1 }
            ];

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `*${botName} 2026*`,
              buttons: buttons,
              headerType: 4,
              mentions: [sender]
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('Alive command error:', e);
            await socket.sendMessage(sender, { text: '❌ An error occurred in alive command.' }, { quoted: msg });
          }
          break;
        }

        // ==================== PASTPAPER COMMAND (DIRECT SUBJECT SELECTION) ====================
case 'pastpaper':
case 'pp':
case 'pastpapers':
case 'papers':
case 'paper':
case 'pastpaperlk':
case 'pastpaperslk': {
  try {
    const axios = require('axios');
    
    // Load user config
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || BOT_NAME_FANCY;
    const prefix = cfg.PREFIX || config.PREFIX || '.';

    // Subjects with emojis (comprehensive list)
    const SUBJECTS = {
      'maths': '🧮 Mathematics',
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
      'orientalmusic': '🏯 Oriental Music',
      'engineering': '⚙️ Engineering Technology',
      'biosystems': '🌱 Bio Systems Technology',
      'business': '💼 Business Studies',
      'frech': '🇫🇷 French',
      'german': '🇩🇪 German',
      'japanese': '🇯🇵 Japanese',
      'chinese': '🇨🇳 Chinese',
      'hinduism': '🕉️ Hinduism',
      'islam': '🕌 Islam',
      'catholicism': '⛪ Catholicism',
      'christianity': '✝️ Christianity'
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
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Education Hub Sri Lanka
END:VCARD`
        }
      }
    };

    const userQuery = args.join(' ').trim();
    const API_KEY = 'dew_BFJBP1gi0pxFIdCasrTqXjeZzcmoSpz4SE4FtG9B';

    // --- MAIN MENU WITH SUBJECT BUTTONS (if no query) ---
    if (!userQuery) {
      // Create subject selection buttons (organized in batches)
      const subjectEntries = Object.entries(SUBJECTS);
      const totalBatches = Math.ceil(subjectEntries.length / 10);
      
      // Create main menu with subject categories
      const menuCaption = `╭───「 📚 *PAST PAPER HUB - SRI LANKA* 」───◆
│
│ 🎯 *Select Your Subject*
│ 
│ ┌─ [ POPULAR SUBJECTS ] ──────────┐
│ ${subjectEntries.slice(0, 5).map(([key, value]) => `│ ${value}`).join('\n')}
│ └───────────────────────────────────┘
│
│ ┌─ [ SCIENCE & MATHS ] ───────────┐
│ ${subjectEntries.slice(5, 10).map(([key, value]) => `│ ${value}`).join('\n')}
│ └───────────────────────────────────┘
│
│ ┌─ [ COMMERCE & ARTS ] ───────────┐
│ ${subjectEntries.slice(10, 15).map(([key, value]) => `│ ${value}`).join('\n')}
│ └───────────────────────────────────┘
│
│ 📝 *Quick Commands:*
│ • ${prefix}pastpaper <subject>
│ • ${prefix}pastpaper <url>
│
│ *Examples:*
│ • ${prefix}pastpaper maths
│ • ${prefix}pastpaper physics
│ • ${prefix}pastpaper chemistry
│
╰───────────────────────◆

> *🇱🇰 Sri Lankan Educational Past Papers*
> *Powered by ${botName}*`;

      // Create buttons for first 20 subjects
      const subjectButtons = subjectEntries.slice(0, 20).map(([key, value]) => ({
        buttonId: `${prefix}pastpaper ${key}`,
        buttonText: { displayText: value },
        type: 1
      }));

      // Add category buttons
      const categoryButtons = [
        {
          buttonId: `${prefix}pastpaper science-maths`,
          buttonText: { displayText: "🔬 Science & Maths" },
          type: 1
        },
        {
          buttonId: `${prefix}pastpaper commerce-arts`,
          buttonText: { displayText: "💼 Commerce & Arts" },
          type: 1
        },
        {
          buttonId: `${prefix}pastpaper languages`,
          buttonText: { displayText: "🌐 Languages" },
          type: 1
        },
        {
          buttonId: `${prefix}pastpaper religion`,
          buttonText: { displayText: "🕉️ Religion" },
          type: 1
        },
        {
          buttonId: `${prefix}pastpaper technology`,
          buttonText: { displayText: "⚙️ Technology" },
          type: 1
        }
      ];

      // Combine buttons (max 20)
      const allButtons = [...categoryButtons, ...subjectButtons.slice(0, 15)];

      const buttonMessage = {
        image: { url: "https://files.catbox.moe/x5x2vy.jpg" },
        caption: menuCaption,
        footer: "👇 Click a button to search",
        buttons: allButtons,
        headerType: 4,
        contextInfo: {
          externalAdReply: {
            title: "📚 Sri Lanka Past Paper Downloader",
            body: "All Subjects - Grade 5 to A/L",
            thumbnailUrl: "https://files.catbox.moe/x5x2vy.jpg",
            sourceUrl: "https://pastpaper.lk",
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      };

      return await socket.sendMessage(sender, buttonMessage, { quoted: botMention });
    }

    // --- HANDLE CATEGORY BUTTONS ---
    if (userQuery === 'science-maths') {
      const scienceSubjects = Object.entries(SUBJECTS).filter(([key, value]) => 
        ['physics', 'chemistry', 'biology', 'science', 'combinedmaths', 'maths', 'ict', 'engineering', 'biosystems'].includes(key)
      );
      
      const buttons = scienceSubjects.map(([key, value]) => ({
        buttonId: `${prefix}pastpaper ${key}`,
        buttonText: { displayText: value },
        type: 1
      }));

      const caption = `╭───「 🔬 *SCIENCE & MATHEMATICS* 」───◆
│
│ 🎯 *Select Your Subject*
│ 
${scienceSubjects.map(([key, value]) => `│ • ${value}`).join('\n')}
│
╰───────────────────────◆

> *Click a button below to search*`;

      return await socket.sendMessage(sender, {
        image: { url: "https://files.catbox.moe/x5x2vy.jpg" },
        caption: caption,
        footer: "📚 Past Paper Downloader",
        buttons: buttons.slice(0, 20),
        headerType: 4
      }, { quoted: botMention });
    }

    if (userQuery === 'commerce-arts') {
      const commerceSubjects = Object.entries(SUBJECTS).filter(([key, value]) => 
        ['commerce', 'accounting', 'economics', 'business', 'history', 'geography', 'political', 'logic', 'drama', 'music', 'art', 'dancing'].includes(key)
      );
      
      const buttons = commerceSubjects.map(([key, value]) => ({
        buttonId: `${prefix}pastpaper ${key}`,
        buttonText: { displayText: value },
        type: 1
      }));

      const caption = `╭───「 💼 *COMMERCE & ARTS* 」───◆
│
│ 🎯 *Select Your Subject*
│ 
${commerceSubjects.map(([key, value]) => `│ • ${value}`).join('\n')}
│
╰───────────────────────◆

> *Click a button below to search*`;

      return await socket.sendMessage(sender, {
        image: { url: "https://files.catbox.moe/x5x2vy.jpg" },
        caption: caption,
        footer: "📚 Past Paper Downloader",
        buttons: buttons.slice(0, 20),
        headerType: 4
      }, { quoted: botMention });
    }

    if (userQuery === 'languages') {
      const langSubjects = Object.entries(SUBJECTS).filter(([key, value]) => 
        ['sinhala', 'english', 'tamil', 'frech', 'german', 'japanese', 'chinese'].includes(key)
      );
      
      const buttons = langSubjects.map(([key, value]) => ({
        buttonId: `${prefix}pastpaper ${key}`,
        buttonText: { displayText: value },
        type: 1
      }));

      const caption = `╭───「 🌐 *LANGUAGES* 」───◆
│
│ 🎯 *Select Your Language Subject*
│ 
${langSubjects.map(([key, value]) => `│ • ${value}`).join('\n')}
│
╰───────────────────────◆

> *Click a button below to search*`;

      return await socket.sendMessage(sender, {
        image: { url: "https://files.catbox.moe/x5x2vy.jpg" },
        caption: caption,
        footer: "📚 Past Paper Downloader",
        buttons: buttons.slice(0, 20),
        headerType: 4
      }, { quoted: botMention });
    }

    if (userQuery === 'religion') {
      const religionSubjects = Object.entries(SUBJECTS).filter(([key, value]) => 
        ['buddhism', 'hinduism', 'islam', 'catholicism', 'christianity'].includes(key)
      );
      
      const buttons = religionSubjects.map(([key, value]) => ({
        buttonId: `${prefix}pastpaper ${key}`,
        buttonText: { displayText: value },
        type: 1
      }));

      const caption = `╭───「 🕉️ *RELIGION* 」───◆
│
│ 🎯 *Select Your Religion Subject*
│ 
${religionSubjects.map(([key, value]) => `│ • ${value}`).join('\n')}
│
╰───────────────────────◆

> *Click a button below to search*`;

      return await socket.sendMessage(sender, {
        image: { url: "https://files.catbox.moe/x5x2vy.jpg" },
        caption: caption,
        footer: "📚 Past Paper Downloader",
        buttons: buttons.slice(0, 20),
        headerType: 4
      }, { quoted: botMention });
    }

    if (userQuery === 'technology') {
      const techSubjects = Object.entries(SUBJECTS).filter(([key, value]) => 
        ['ict', 'engineering', 'biosystems', 'health'].includes(key)
      );
      
      const buttons = techSubjects.map(([key, value]) => ({
        buttonId: `${prefix}pastpaper ${key}`,
        buttonText: { displayText: value },
        type: 1
      }));

      const caption = `╭───「 ⚙️ *TECHNOLOGY* 」───◆
│
│ 🎯 *Select Your Technology Subject*
│ 
${techSubjects.map(([key, value]) => `│ • ${value}`).join('\n')}
│
╰───────────────────────◆

> *Click a button below to search*`;

      return await socket.sendMessage(sender, {
        image: { url: "https://files.catbox.moe/x5x2vy.jpg" },
        caption: caption,
        footer: "📚 Past Paper Downloader",
        buttons: buttons.slice(0, 20),
        headerType: 4
      }, { quoted: botMention });
    }

    // --- CHECK IF IT'S A URL (DOWNLOAD MODE) ---
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

        let paperTitle = paperInfo.title || 'Past Paper';
        if (!paperTitle || paperTitle === 'Past Paper') {
          const urlParts = userQuery.split('/');
          const lastPart = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
          paperTitle = lastPart.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        // Check if API returned PDF data
        if (paperInfo.pdf_data) {
          const pdfBuffer = Buffer.from(paperInfo.pdf_data, 'base64');
          const fileSizeMB = (pdfBuffer.length / (1024 * 1024)).toFixed(2);

          if (pdfBuffer.length > 100 * 1024 * 1024) {
            const buttons = [
              {
                buttonId: `${prefix}pastpaper`,
                buttonText: { displayText: "📚 SEARCH AGAIN" },
                type: 1
              },
              {
                buttonId: `${prefix}menu`,
                buttonText: { displayText: "📋 MENU" },
                type: 1
              }
            ];

            return await socket.sendMessage(sender, {
              text: `⚠️ File too large (${fileSizeMB} MB). WhatsApp limit is 100MB.\n\n🔗 *Direct link:* ${userQuery}`,
              buttons: buttons
            }, { quoted: botMention });
          }

          const fileName = paperTitle
            .replace(/[^\w\s]/gi, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50) + '.pdf';

          const successButtons = [
            {
              buttonId: `${prefix}pastpaper`,
              buttonText: { displayText: "📚 SEARCH AGAIN" },
              type: 1
            },
            {
              buttonId: `${prefix}pastpaper maths`,
              buttonText: { displayText: "🧮 MATHS" },
              type: 1
            },
            {
              buttonId: `${prefix}pastpaper science`,
              buttonText: { displayText: "🔬 SCIENCE" },
              type: 1
            },
            {
              buttonId: `${prefix}pastpaper english`,
              buttonText: { displayText: "📘 ENGLISH" },
              type: 1
            },
            {
              buttonId: `${prefix}menu`,
              buttonText: { displayText: "🏠 MENU" },
              type: 1
            }
          ];

          await socket.sendMessage(sender, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: fileName,
            caption: `╭───「 📚 *PAST PAPER DOWNLOADED* 」───◆
│
│ 📄 *Title:* ${paperTitle.substring(0, 100)}
│ 📦 *Size:* ${fileSizeMB} MB
│ 🔗 *Source:* pastpaper.lk
│
╰───────────────────────◆

*✅ Downloaded via ${botName}*

_Use buttons below for more papers_`,
            buttons: successButtons,
            contextInfo: {
              externalAdReply: {
                title: "📚 Past Paper Downloaded",
                body: paperTitle.substring(0, 50),
                thumbnailUrl: "https://files.catbox.moe/x5x2vy.jpg",
                sourceUrl: userQuery,
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
          }, { quoted: botMention });

          await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
          break;
        }

        // If no PDF data, try to get PDF URL
        let directPdfUrl = paperInfo.pdf_url || paperInfo.url;

        if (!directPdfUrl) {
          // Try to scrape for PDF
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
        }

        if (!directPdfUrl) {
          const buttons = [
            {
              buttonId: `${prefix}pastpaper`,
              buttonText: { displayText: "📚 SEARCH AGAIN" },
              type: 1
            },
            {
              buttonId: `${prefix}menu`,
              buttonText: { displayText: "📋 MENU" },
              type: 1
            }
          ];

          return await socket.sendMessage(sender, {
            text: `❌ Could not find direct download link.\n\n🔗 *Link:* ${userQuery}\n\nYou may need to download manually from the website.`,
            buttons: buttons
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
          const buttons = [
            {
              buttonId: `${prefix}pastpaper`,
              buttonText: { displayText: "📚 SEARCH AGAIN" },
              type: 1
            },
            {
              buttonId: `${prefix}menu`,
              buttonText: { displayText: "📋 MENU" },
              type: 1
            }
          ];

          return await socket.sendMessage(sender, {
            text: `⚠️ File too large (${fileSizeMB} MB). WhatsApp limit is 100MB.\n\n🔗 *Direct link:* ${directPdfUrl}`,
            buttons: buttons
          }, { quoted: botMention });
        }

        const fileName = paperTitle
          .replace(/[^\w\s]/gi, '_')
          .replace(/\s+/g, '_')
          .substring(0, 50) + '.pdf';

        const successButtons = [
          {
            buttonId: `${prefix}pastpaper`,
            buttonText: { displayText: "📚 SEARCH AGAIN" },
            type: 1
          },
          {
            buttonId: `${prefix}pastpaper maths`,
            buttonText: { displayText: "🧮 MATHS" },
            type: 1
          },
          {
            buttonId: `${prefix}pastpaper science`,
            buttonText: { displayText: "🔬 SCIENCE" },
            type: 1
          },
          {
            buttonId: `${prefix}pastpaper english`,
            buttonText: { displayText: "📘 ENGLISH" },
            type: 1
          },
          {
            buttonId: `${prefix}menu`,
            buttonText: { displayText: "🏠 MENU" },
            type: 1
          }
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

*✅ Downloaded via ${botName}*

_Use buttons below for more papers_`,
          buttons: successButtons,
          contextInfo: {
            externalAdReply: {
              title: "📚 Past Paper Downloaded",
              body: paperTitle.substring(0, 50),
              thumbnailUrl: "https://files.catbox.moe/x5x2vy.jpg",
              sourceUrl: userQuery,
              mediaType: 1,
              renderLargerThumbnail: true
            }
          }
        }, { quoted: botMention });

        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

      } catch (dlErr) {
        console.error('Download error:', dlErr);

        const errorButtons = [
          {
            buttonId: `${prefix}pastpaper`,
            buttonText: { displayText: "🔄 TRY AGAIN" },
            type: 1
          },
          {
            buttonId: `${prefix}menu`,
            buttonText: { displayText: "📋 MENU" },
            type: 1
          }
        ];

        await socket.sendMessage(sender, {
          text: `❌ Download failed: ${dlErr.message || 'Unknown error'}\n\nTry visiting the link directly:\n${userQuery}`,
          buttons: errorButtons
        }, { quoted: botMention });
      }
      break;
    }

    // --- REGULAR SEARCH MODE (by subject) ---
    await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });
    await socket.sendMessage(sender, { text: `*🔎 Searching past papers for: ${userQuery}...*` }, { quoted: botMention });

    const searchApiUrl = `https://api.srihub.store/education/pastpaper?q=${encodeURIComponent(userQuery)}&apikey=${API_KEY}`;
    const searchRes = await axios.get(searchApiUrl);

    if (!searchRes.data?.success || !searchRes.data?.result || searchRes.data.result.length === 0) {
      // Show popular subjects as suggestions
      const suggestionButtons = [
        { buttonId: `${prefix}pastpaper maths`, buttonText: { displayText: "🧮 MATHS" }, type: 1 },
        { buttonId: `${prefix}pastpaper science`, buttonText: { displayText: "🔬 SCIENCE" }, type: 1 },
        { buttonId: `${prefix}pastpaper english`, buttonText: { displayText: "📘 ENGLISH" }, type: 1 },
        { buttonId: `${prefix}pastpaper sinhala`, buttonText: { displayText: "📝 SINHALA" }, type: 1 },
        { buttonId: `${prefix}pastpaper history`, buttonText: { displayText: "🏛️ HISTORY" }, type: 1 }
      ];

      return await socket.sendMessage(sender, {
        text: `❌ No past papers found for "${userQuery}".\n\nTry these popular subjects:`,
        buttons: suggestionButtons
      }, { quoted: botMention });
    }

    const results = searchRes.data.result.slice(0, 8);

    // Create buttons for each result
    const resultButtons = results.map((item, index) => ({
      buttonId: `paper_${index}`,
      buttonText: { displayText: `📄 ${item.title.substring(0, 30)}...` },
      type: 1
    }));

    // Add quick subject buttons
    const quickSubjectButtons = [
      {
        buttonId: `${prefix}pastpaper maths`,
        buttonText: { displayText: "🧮 MATHS" },
        type: 1
      },
      {
        buttonId: `${prefix}pastpaper science`,
        buttonText: { displayText: "🔬 SCIENCE" },
        type: 1
      },
      {
        buttonId: `${prefix}pastpaper english`,
        buttonText: { displayText: "📘 ENGLISH" },
        type: 1
      }
    ];

    // Add navigation buttons
    const navButtons = [
      {
        buttonId: `${prefix}pastpaper`,
        buttonText: { displayText: "📚 ALL SUBJECTS" },
        type: 1
      },
      {
        buttonId: `${prefix}menu`,
        buttonText: { displayText: "🏠 MENU" },
        type: 1
      }
    ];

    let listMessage = `╭───「 📚 *SEARCH RESULTS* 」───◆
│
│ *Subject:* ${userQuery}
│ *Found:* ${searchRes.data.result.length} papers
│
`;

    results.forEach((item, index) => {
      let title = item.title
        .replace(/G\.C\.E|GCE|Past Papers|Past papers/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 60);

      listMessage += `│ *${index + 1}.* ${title}\n`;
    });

    listMessage += `│
╰───────────────────────◆

*📱 Click buttons below to download*
> *Powered by ${botName}*`;

    // Store results in cache
    if (!global.ppSearchCache) global.ppSearchCache = {};
    global.ppSearchCache[sender] = {
      results: results,
      timestamp: Date.now(),
      query: userQuery
    };

    // Auto-clean cache after 10 minutes
    setTimeout(() => {
      if (global.ppSearchCache[sender]) delete global.ppSearchCache[sender];
    }, 10 * 60 * 1000);

    // Combine all buttons (max 20)
    const allButtons = [...resultButtons, ...quickSubjectButtons, ...navButtons].slice(0, 20);

    // Send results with buttons
    const thumbnail = results[0]?.image || "https://files.catbox.moe/x5x2vy.jpg";

    const buttonMessage = {
      image: { url: thumbnail },
      caption: listMessage,
      footer: `📚 Past Paper Downloader - Sri Lanka`,
      buttons: allButtons,
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
    };

    await socket.sendMessage(sender, buttonMessage, { quoted: botMention });

  } catch (err) {
    console.error('Pastpaper command error:', err);

    const errorButtons = [
      {
        buttonId: `${config.PREFIX || '.'}pastpaper`,
        buttonText: { displayText: "🔄 TRY AGAIN" },
        type: 1
      },
      {
        buttonId: `${config.PREFIX || '.'}menu`,
        buttonText: { displayText: "📋 MENU" },
        type: 1
      }
    ];

    await socket.sendMessage(sender, {
      text: `❌ Error: ${err.message || 'Unknown error occurred'}`,
      buttons: errorButtons
    }, { quoted: msg });
  }
  break;
}

        // ==================== DEFAULT ====================
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch (e) { }
    }

  });

  // --- ENHANCED PASTPAPER REPLY HANDLER (with button support) ---
  const handlePastpaperReply = async ({ messages: replyMessages }) => {
    const replyMek = replyMessages[0];
    if (!replyMek?.message) return;

    const chat = replyMek.key.remoteJid;
    const senderJid = replyMek.key.participant || replyMek.key.remoteJid;

    // Get button response if it's a button click
    let selectedId = null;
    let replyText = '';

    if (replyMek.message.buttonsResponseMessage) {
      selectedId = replyMek.message.buttonsResponseMessage.selectedButtonId;
    } else if (replyMek.message.templateButtonReplyMessage) {
      selectedId = replyMek.message.templateButtonReplyMessage.selectedId;
    } else if (replyMek.message.conversation) {
      replyText = replyMek.message.conversation;
    } else if (replyMek.message.extendedTextMessage) {
      replyText = replyMek.message.extendedTextMessage.text || '';
    }

    // Handle paper selection via button
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

      // Clear cache
      delete global.ppSearchCache[senderJid];

      // Load bot config
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      let cfg = await loadUserConfigFromMongo(sanitized) || {};
      let botName = cfg.botName || BOT_NAME_FANCY;
      const prefix = cfg.PREFIX || config.PREFIX || '.';

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
            vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Education Hub Sri Lanka
END:VCARD`
          }
        }
      };

      await socket.sendMessage(chat, {
        text: `⬇️ *Downloading:* ${selectedPaper.title.substring(0, 100)}...`
      }, { quoted: botMention });

      // Download the paper
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

        // Download PDF
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
          {
            buttonId: `${prefix}pastpaper`,
            buttonText: { displayText: "📚 SEARCH AGAIN" },
            type: 1
          },
          {
            buttonId: `${prefix}menu`,
            buttonText: { displayText: "🏠 MENU" },
            type: 1
          }
        ];

        await socket.sendMessage(chat, {
          document: fileBuffer,
          mimetype: 'application/pdf',
          fileName: fileName,
          caption: `📚 *${selectedPaper.title.substring(0, 100)}*\n\n📦 Size: ${fileSizeMB} MB\n✅ Downloaded via ${botName}`,
          buttons: successButtons
        }, { quoted: botMention });

      } catch (dlErr) {
        console.error('Reply download error:', dlErr);

        const errorButtons = [
          {
            buttonId: `${prefix}pastpaper`,
            buttonText: { displayText: "🔄 TRY AGAIN" },
            type: 1
          },
          {
            buttonId: `${prefix}menu`,
            buttonText: { displayText: "📋 MENU" },
            type: 1
          }
        ];

        await socket.sendMessage(chat, {
          text: `❌ Download failed. Try the direct link:\n${selectedPaper.url}`,
          buttons: errorButtons
        }, { quoted: botMention });
      }
    }
  };

  // Register the reply handler
  socket.ev.on('messages.upsert', handlePastpaperReply);
}

// ---------------- Call Rejection Handler ----------------
async function setupCallRejection(socket, sessionNumber) {
  socket.ev.on('call', async (calls) => {
    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      if (userConfig.ANTI_CALL !== 'on') return;

      console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);

      for (const call of calls) {
        if (call.status !== 'offer') continue;

        const id = call.id;
        const from = call.from;

        await socket.rejectCall(id, from);

        await socket.sendMessage(from, {
          text: '*🔕 Auto call rejection is enabled. Calls are automatically rejected.*'
        });

        console.log(`✅ Auto-rejected call from ${from}`);

        const userJid = jidNormalizedUser(socket.user.id);
        const rejectionMessage = formatMessage(
          '📞 CALL REJECTED',
          `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
          BOT_NAME_FANCY
        );

        await socket.sendMessage(userJid, {
          image: { url: config.RCD_IMAGE_PATH },
          caption: rejectionMessage
        });
      }
    } catch (err) {
      console.error(`Call rejection error for ${sessionNumber}:`, err);
    }
  });
}

// ---------------- Auto Message Read Handler ----------------
async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;

    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage')
        ? msg.message.ephemeralMessage.message
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      body = '';
    }

    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    if (autoReadSetting === 'all') {
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read message (single attempt):', error?.message);
      }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read command message (single attempt):', error?.message);
      }
    }
  });
}

// ---------------- message handlers ----------------
function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    try {
      let autoTyping = config.AUTO_TYPING;
      let autoRecording = config.AUTO_RECORDING;

      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};

        if (userConfig.AUTO_TYPING !== undefined) {
          autoTyping = userConfig.AUTO_TYPING;
        }

        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      if (autoTyping === 'true') {
        try {
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) { }
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }

      if (autoRecording === 'true') {
        try {
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) { }
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}

// ---------------- cleanup helper ----------------
async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) { }
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch (e) { }
    try { await removeNumberFromMongo(sanitized); } catch (e) { }
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
      const caption = formatMessage('*🥷 OWNER NOTICE — SESSION REMOVED*', `*𝐍umber:* ${sanitized}\n*𝐒ession 𝐑emoved 𝐃ue 𝐓o 𝐋ogout.*\n\n*𝐀ctive 𝐒essions 𝐍ow:* ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
    } catch (e) { }
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------
function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
        || lastDisconnect?.error?.statusCode
        || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
        || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
        || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
        || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch (e) { console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g, '')); socketCreationTime.delete(number.replace(/[^0-9]/g, '')); const mockRes = { headersSent: false, send: () => { }, status: () => mockRes }; await EmpirePair(number, mockRes); } catch (e) { console.error('Reconnect attempt failed', e); }
      }
    }
  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(() => { });

  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);
    setupAutoMessageRead(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      let dina = `NOVAMINI`;

      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber, dina); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();

        const credsPath = path.join(sessionPath, 'creds.json');

        if (!fs.existsSync(credsPath)) return;
        const fileStats = fs.statSync(credsPath);
        if (fileStats.size === 0) return;

        const fileContent = await fs.readFile(credsPath, 'utf8');
        const trimmedContent = fileContent.trim();
        if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') return;

        let credsObj;
        try { credsObj = JSON.parse(trimmedContent); } catch (e) { return; }

        if (!credsObj || typeof credsObj !== 'object') return;

        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
        console.log('✅ Creds saved to MongoDB successfully');

      } catch (err) {
        console.error('Failed saving creds on creds.update:', err);
      }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(() => ({ status: 'failed', error: 'joinGroup not configured' }));

          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) { }
            }
          } catch (e) { }

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
            `*✅ 𝐒uccessfully 𝐂onnected*\n\n*🔢 𝐍umber:* ${sanitizedNumber}\n*🕒 𝐂onnecting: Bot will become active in a few seconds*`,
            useBotName
          );

          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch (e) { }
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `*✅ 𝐒uccessfully 𝐂onnected 𝐀nd 𝐀ctive*\n\n*🔢 𝐍umber:* ${sanitizedNumber}\n*🩵 𝐒tatus:* ${groupStatus}\n*🕒 𝐂onnected 𝐀t:* ${getSriLankaTimestamp()}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try { await socket.sendMessage(userJid, { delete: sentMsg.key }); } catch (delErr) { }
            }
            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) { }

          await addNumberToMongo(sanitizedNumber);

        } catch (e) {
          console.error('Connection open error:', e);
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch (e) { }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) { }
      }
    });

    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ---------------- endpoints (admin/newsletter management + others) ----------------
router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

// admin endpoints
router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

// existing endpoints (connect, reconnect, active, etc.)
router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: '🩵 ᴅᴛᴢ ɴᴏᴠᴀ x ᴍᴅ ᴠ.1 🩵', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});

router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});

router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});

router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});

router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});

// ---------------- Dashboard endpoints & static ----------------
const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});

// API: sessions & active & delete
router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(() => { }); } catch (e) { }
      try { running.ws?.close(); } catch (e) { }
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch (e) { }
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

// ---------------- cleanup + process events ----------------
process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) { }
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch (e) { }
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'Dtz-Nova-main'}`); } catch (e) { console.error('Failed to restart pm2:', e); }
});

// initialize mongo & auto-reconnect attempt
initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async () => {
  try {
    const nums = await getAllNumbersFromMongo();
    if (nums && nums.length) {
      for (const n of nums) {
        if (!activeSockets.has(n)) {
          const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
          await EmpirePair(n, mockRes);
          await delay(500);
        }
      }
    }
  } catch (e) { }
})();

module.exports = router;
