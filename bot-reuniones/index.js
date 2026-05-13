const { Client, GatewayIntentBits } = require('discord.js');
const {
    joinVoiceChannel,
    EndBehaviorType,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection
} = require('@discordjs/voice');

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const prism = require('prism-media');
const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType
} = require("docx");

require('dotenv').config();

// ================= PATHS =================
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const TRANSCRIPTS_DIR = path.join(__dirname, 'transcripts');

const WHISPER_BINARY = '/app/whisper.cpp/build/bin/whisper-cli';
const WHISPER_MODEL = '/app/whisper.cpp/models/ggml-base.bin';

fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

// ================= CLIENT =================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const activeUsers = new Map();

// ================= ACTA =================
const meetingLog = [];
let meetingStart = null;
let voiceConnection = null;

// ================= READY =================
client.once('ready', () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ================= JOIN / LEAVE =================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ================= JOIN =================
    if (message.content === '!join') {
        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply('❌ Debes estar en voz.');

        voiceConnection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });

        await entersState(voiceConnection, VoiceConnectionStatus.Ready, 20000);

        message.reply(
        `🎤 **Reunión iniciada correctamente**

        📌 El bot está escuchando el canal de voz.

        🟢 Para iniciar una reunión escribe: **!join**
        🔴 Para finalizar y generar el acta escribe: **!leave**

        📄 Al finalizar, se generará automáticamente el documento Word con la transcripción y el resumen.`
        );

        meetingStart = new Date();
        meetingLog.length = 0;

        const receiver = voiceConnection.receiver;

        receiver.speaking.on('start', (userId) => {
            if (userId === client.user.id) return;
            if (activeUsers.get(userId)) return;

            activeUsers.set(userId, true);

            const opusStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 1200
                }
            });

            const decoder = new prism.opus.Decoder({
                rate: 48000,
                channels: 1,
                frameSize: 960
            });

            const filename = path.join(
                RECORDINGS_DIR,
                `${userId}-${Date.now()}.wav`
            );

            const ffmpeg = spawn('ffmpeg', [
                '-loglevel', 'quiet',
                '-f', 's16le',
                '-ar', '48000',
                '-ac', '1',
                '-i', 'pipe:0',
                '-ar', '16000',
                '-ac', '1',
                '-c:a', 'pcm_s16le',
                filename
            ]);

            opusStream.pipe(decoder).pipe(ffmpeg.stdin);

            ffmpeg.on('close', (code) => {
                activeUsers.set(userId, false);

                if (code !== 0) return;

                const size = fs.statSync(filename).size;
                if (size < 8000) {
                    fs.unlinkSync(filename);
                    return;
                }

                transcribir(filename, userId, message.channel);
            });
        });
    }

    // ================= LEAVE =================
    if (message.content === '!leave') {
        const connection = getVoiceConnection(message.guild.id);

        if (connection) {
            const filePath = await generarWord();

            await message.channel.send({
                content: '📄 **ACTA DE REUNIÓN (WORD)**',
                files: [filePath]
            });

            connection.destroy();

            meetingLog.length = 0;
            meetingStart = null;
            voiceConnection = null;

            message.reply('👋 Reunión finalizada.');
        }
    }
});

// ================= TRANSCRIPCIÓN =================
function transcribir(wavPath, userId, textChannel) {
    const outputBase = path.join(
        TRANSCRIPTS_DIR,
        `res-${userId}-${Date.now()}`
    );

    const command = [
        WHISPER_BINARY,
        '-m', WHISPER_MODEL,
        '-f', wavPath,
        '-otxt',
        '-of', outputBase,
        '-l', 'es'
    ];

    const proc = spawn(command[0], command.slice(1));

    proc.on('close', (code) => {
        const txtFile = `${outputBase}.txt`;

        if (!fs.existsSync(txtFile)) return;

        const text = fs.readFileSync(txtFile, 'utf-8').trim();

        if (text.length > 0) {
            meetingLog.push({
                userId,
                text,
                time: new Date().toLocaleTimeString()
            });

            //textChannel.send(`**<@${userId}> dijo:**\n> ${text}`);
        }

        fs.unlinkSync(txtFile);
        fs.unlinkSync(wavPath);
    });
}

function formatearFecha() {
    const meses = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const fecha = new Date();

    const dia = fecha.getDate();
    const mes = meses[fecha.getMonth()];
    const año = fecha.getFullYear();

    return `Quito, ${dia} de ${mes} del ${año}`;
}

async function generarWord() {
    // Formato de fecha solicitado
    const fechaCiudad = formatearFecha();

    // Resumen más ejecutivo
    const resumenTexto = meetingLog.length > 0
        ? `La presente sesión registró un total de ${meetingLog.length} intervenciones clave. Durante el desarrollo de la misma, se abordaron los puntos estratégicos del orden del día, estableciendo los compromisos necesarios para el cumplimiento de los objetivos institucionales.`
        : "No se registraron intervenciones durante la sesión.";

    const doc = new Document({
        sections: [
            {
                properties: {},
                children: [
                    // ================= FECHA (Derecha) =================
                    new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({
                                text: fechaCiudad,
                                size: 22, // 11pt
                                font: "Arial",
                            }),
                        ],
                    }),

                    new Paragraph({ text: "" }), // Espacio

                    // ================= TÍTULO CENTRAL =================
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({
                                text: "ACTA DE REUNIÓN",
                                bold: true,
                                size: 36, // 18pt
                                font: "Arial",
                            }),
                        ],
                    }),

                    new Paragraph({ text: "" }),
                    new Paragraph({ text: "" }),

                    // ================= SECCIÓN: TRANSCRIPCIÓN =================
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "1. DETALLE DE INTERVENCIONES",
                                bold: true,
                                size: 24, // 12pt
                                font: "Arial",
                            }),
                        ],
                    }),

                    new Paragraph({ text: "" }),

                    ...meetingLog.map(m =>
                        new Paragraph({
                            bullet: { level: 0 }, // Formato de lista para mayor orden
                            children: [
                                new TextRun({
                                    text: m.text,
                                    font: "Arial",
                                }),
                            ]
                        })
                    ),

                    new Paragraph({ text: "" }),

                    // ================= SECCIÓN: RESUMEN =================
                    new Paragraph({
                        children: [
                            new TextRun({
                                text: "2. RESUMEN EJECUTIVO",
                                bold: true,
                                size: 24,
                                font: "Arial",
                            }),
                        ],
                    }),

                    new Paragraph({ text: "" }),

                    new Paragraph({
                        alignment: AlignmentType.JUSTIFIED,
                        children: [
                            new TextRun({
                                text: resumenTexto,
                                size: 22,
                                font: "Arial",
                            }),
                        ],
                    }),

                    // ================= FIRMAS =================
                    new Paragraph({ text: "" }),
                    new Paragraph({ text: "" }),
                    new Paragraph({ text: "" }),
                    new Paragraph({ text: "" }),

                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({
                                text: "___________________________",
                                font: "Arial",
                            }),
                        ],
                    }),

                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({
                                text: "Gerente General",
                                bold: true,
                                font: "Arial",
                            }),
                        ],
                    }),

                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({
                                text: "Edison Toscano",
                                font: "Arial",
                            }),
                        ],
                    }),
                ],
            },
        ],
    });

    const buffer = await Packer.toBuffer(doc);
    const filePath = path.join(TRANSCRIPTS_DIR, `acta-${Date.now()}.docx`);
    fs.writeFileSync(filePath, buffer);

    return filePath;
}



// ================= LOGIN =================
client.login(process.env.DISCORD_TOKEN);