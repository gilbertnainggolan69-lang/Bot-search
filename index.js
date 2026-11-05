const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const axios = require('axios');
const pino = require('pino');
const readline = require('readline');

// ====== KONFIGURASI ======
const PREFIX = '.';
const BOT_NAME = 'GILBERT BOT';
const MAX_RESULTS = 5;

// Nomor dev (tanpa +, tanpa spasi, tanpa strip)
// +62 858-2067-3526  ->  6285820673526
const DEV_NUMBER = '6285820673526';
const DEV_DISPLAY = '+62 858-2067-3526';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// ====== KONEKSI PAIRING CODE ======
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false, // WAJIB false buat pairing code
  });

  sock.ev.on('creds.update', saveCreds);

  // Pairing code: minta kode kalau belum registered
  if (!sock.authState.creds.registered) {
    sock.ev.on('connection.update', async (update) => {
      const { qr, connection } = update;

      // Trigger pairing code pas event qr muncul (tapi gak ditampilin)
      if (qr && !sock.authState.creds.registered) {
        const code = await sock.requestPairingCode(DEV_NUMBER);
        console.log(`\n🔑 *PAIRING CODE:* ${code}`);
        console.log(`📱 Masukkan kode ini di WhatsApp nomor ${DEV_DISPLAY}\n`);
      }

      if (connection === 'open') {
        console.log(`✅ ${BOT_NAME} tersambung!`);
        rl.close();
      }
    });
  }

  // Reconnect logic
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });

  // ====== HANDLER PESAN ======
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';
    if (!text.startsWith(PREFIX)) return;

    const args = text.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const query = args.join(' ');

    // ----- FITUR .search -----
    if (command === 'search') {
      if (!query) {
        return sock.sendMessage(msg.key.remoteJid, {
          text: `⚠️ *Format salah!*\nContoh: \`${PREFIX}search blade ball\``,
        });
      }
      await handleSearch(sock, msg, query);
    }

    // ----- FITUR .dev -----
    if (command === 'dev') {
      await handleDev(sock, msg);
    }
  });
}

// ====== HANDLER .search ======
async function handleSearch(sock, msg, query) {
  const jid = msg.key.remoteJid;

  try {
    await sock.sendMessage(jid, { text: `🔍 *Mencari script:* \`${query}\`...` });

    const res = await axios.get('https://scriptblox.com/api/script/search', {
      params: { q: query, max: MAX_RESULTS, mode: 'free' },
      timeout: 10000,
    });

    const scripts = res.data?.result?.scripts || [];

    if (scripts.length === 0) {
      return sock.sendMessage(jid, {
        text: `❌ *Script tidak ditemukan* untuk \`${query}\`.\nCoba kata kunci lain ya!`,
      });
    }

    let teks = `╭━━━「 *${BOT_NAME}* 」━━━⬣\n`;
    teks += `┃ 🔎 *Hasil:* \`${query}\`\n`;
    teks += `┃ 📦 *Total:* ${scripts.length} script\n`;
    teks += `╰━━━━━━━━━━━━━━━━━━⬣\n\n`;

    scripts.forEach((s, i) => {
      const title = s.title || 'Tanpa Judul';
      const link = s.slug ? `https://scriptblox.com/script/${s.slug}` : 'Link tidak tersedia';
      const game = s.game?.name || 'Tidak diketahui';
      const views = s.views ?? 0;
      const keyStatus = s.key ? '🔑 Key System' : '🆓 No Key';
      const verified = s.verified ? '✅ Verified' : '❌ Unverified';

      teks += `┏━━━ *[${i + 1}]* ${title}\n`;
      teks += `┃ 🎮 *Game:* ${game}\n`;
      teks += `┃ 👁️ *Views:* ${views.toLocaleString()}\n`;
      teks += `┃ ${keyStatus} | ${verified}\n`;
      teks += `┃ 🔗 *Link:* ${link}\n`;
      teks += `┗━━━━━━━━━━━━━━━━━━\n\n`;
    });

    teks += `> *BY GILBERT* ✨`;

    await sock.sendMessage(jid, { text: teks.trim() });
  } catch (err) {
    console.error('[SEARCH ERROR]', err.message);
    await sock.sendMessage(jid, {
      text: `💥 *Gagal mengambil data dari ScriptBlox.*\nCoba lagi nanti ya.`,
    });
  }
}

// ====== HANDLER .dev (Kirim Kontak) ======
async function handleDev(sock, msg) {
  const jid = msg.key.remoteJid;

  // vCard format untuk kontak WhatsApp
  const vcard =
    'BEGIN:VCARD\n' +
    'VERSION:3.0\n' +
    `FN:${BOT_NAME} Developer\n` +
    'ORG:GILBERT BOT;\n' +
    `TEL;type=CELL;type=VOICE;waid=${DEV_NUMBER}:${DEV_DISPLAY}\n` +
    'END:VCARD';

  await sock.sendMessage(jid, {
    text: `╭━━━「 *${BOT_NAME}* 」━━━⬣\n` +
          `┃ 👨‍💻 *Developer Bot*\n` +
          `┃ 📱 ${DEV_DISPLAY}\n` +
          `┃\n` +
          `┃ Silakan simpan kontak di bawah ini ya bro!\n` +
          `╰━━━━━━━━━━━━━━━━━━⬣\n\n` +
          `> *BY GILBERT* ✨`,
  });

  // Kirim kontak
  await sock.sendMessage(jid, {
    contacts: {
      displayName: `${BOT_NAME} Developer`,
      contacts: [{ vcard }],
    },
  });
}

// ====== JALANKAN ======
startBot();
