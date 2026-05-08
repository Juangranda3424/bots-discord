const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');

/// SERVIDOR WEB PARA ENGAÑAR A RENDER
const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot funcionando');
});

app.listen(3000, () => {
    console.log('Servidor web activo');
});

///

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
});

// =====================================
// HORARIOS DE EMPLEADOS
// =====================================
const horarios = {

    // Usuario SIN horario fijo
    "dtic.desarrollobpc": {
        libre: true
    },

    // Usuarios CON horario fijo
    "dticbpc": {
        entrada: "09:30"
    },

    "asistentecontabilidad1": {
        entrada: "09:00"
    },
    "asistentecontabilidad2": {
        entrada: "08:00"
    },
    "asistentecontabilidad3": {
        entrada: "08:00"
    },
    "asistentecontabilidad4": {
        entrada: "09:00"
    },
    "asistentecontabilidad5": {
        entrada: "08:00"
    },

};

// =====================================
// PALABRAS DE ENTRADA
// =====================================
const palabrasEntrada = [
    'entrada',
    'ingreso',
    'ingresé',
    'llegue',
    'llegué',
    'llegada',
    'ya llegue',
    'ya llegué',
    'presente',
    'entre',
    'entré',
    'ya vine',
    'vine',
    'inicie jornada',
    'inicio jornada'
];

// =====================================
// PALABRAS DE SALIDA
// =====================================
const palabrasSalida = [
    'salida',
    'salgo',
    'me voy',
    'me retire',
    'me retiré',
    'retiro',
    'finalice jornada',
    'fin jornada',
    'hora de salida',
    'ya sali',
    'ya salí',
    'saliendo'
];

// FUNCION GUARDAR EXCEL
function guardarExcel(archivo, hoja, datos) {

    let workbook;
    let worksheet;
    let registros = [];

    // Verificar si existe archivo
    if (fs.existsSync(archivo)) {

        workbook = XLSX.readFile(archivo);

        worksheet = workbook.Sheets[hoja];

        // Leer datos existentes
        if (worksheet) {
            registros = XLSX.utils.sheet_to_json(worksheet);
        }

    } else {

        // Crear nuevo libro
        workbook = XLSX.utils.book_new();

    }

    // Agregar nuevo registro
    registros.push(datos);

    // Crear hoja
    worksheet = XLSX.utils.json_to_sheet(registros);

    // Asignar hoja
    workbook.Sheets[hoja] = worksheet;

    // Agregar nombre hoja
    if (!workbook.SheetNames.includes(hoja)) {
        workbook.SheetNames.push(hoja);
    }

    // Guardar archivo
    XLSX.writeFile(workbook, archivo);
}

// CONVERTIR HORA A MINUTOS
function convertirHoraMinutos(horaTexto) {

    const [hora, minuto] = horaTexto.split(':').map(Number);

    return (hora * 60) + minuto;
}

// EVENTO MENSAJES
client.on('messageCreate', message => {

    // Ignorar bots
    if (message.author.bot) return;

    // Texto minusculas
    const texto = message.content.toLowerCase();

    // Usuario real discord
    const usuario = message.author.username;

    // Nombre visible servidor
    const nombre = message.member.displayName;

    // Fecha actual
    const fecha = new Date();

    // Hora actual
    const horaActual = fecha.getHours();
    const minutoActual = fecha.getMinutes();

    // Hora formato
    const horaTexto =
        `${horaActual}:${minutoActual.toString().padStart(2, '0')}`;

    // Fecha formato
    const dia = fecha.toLocaleDateString();

    // DETECTAR ENTRADA
    const entrada = palabrasEntrada.some(palabra =>
        texto.includes(palabra)
    );

    // DETECTAR SALIDA
    const salida = palabrasSalida.some(palabra =>
        texto.includes(palabra)
    );

    // HORARIO DEL USUARIO
    const horarioUsuario = horarios[usuario];

    // REGISTRO ENTRADA
    if (entrada) {

        let estado = "A tiempo";

        // Validar SOLO usuarios con horario fijo
        if (horarioUsuario && !horarioUsuario.libre) {

            const horaEmpleado =
                convertirHoraMinutos(horarioUsuario.entrada);

            const horaMensaje =
                (horaActual * 60) + minutoActual;

            // 10 minutos tolerancia
            if (horaMensaje > (horaEmpleado + 10)) {

                estado = "MULTADO";

                // Guardar multa
                guardarExcel(
                    'multas.xlsx',
                    'Multas',
                    {
                        Usuario: usuario,
                        Nombre: nombre,
                        Tipo: 'Entrada atrasada',
                        Fecha: dia,
                        Hora: horaTexto,
                        Multa: '$1',
                        Mensaje: message.content
                    }
                );

                // Mensaje multa
                message.reply(
                    `⚠️ Hola ${nombre}, registraste tu entrada fuera del tiempo permitido y has sido multado con $1.`
                );

            } else {

                // Entrada correcta
                message.reply(
                    `✅ Hola ${nombre}, se registró correctamente tu entrada.`
                );
            }

        } else {

            // Usuario libre
            message.reply(
                `✅ Hola ${nombre}, se registró correctamente tu entrada.`
            );
        }

        // Guardar asistencia
        guardarExcel(
            'asistencia.xlsx',
            'Asistencia',
            {
                Usuario: usuario,
                Nombre: nombre,
                Tipo: 'Entrada',
                Fecha: dia,
                Hora: horaTexto,
                Estado: estado,
                Mensaje: message.content
            }
        );
    }

    // REGISTRO SALIDA
    if (salida) {

        // Guardar salida
        guardarExcel(
            'asistencia.xlsx',
            'Asistencia',
            {
                Usuario: usuario,
                Nombre: nombre,
                Tipo: 'Salida',
                Fecha: dia,
                Hora: horaTexto,
                Mensaje: message.content
            }
        );

        // Mensaje salida
        message.reply(
            `👋 Hola ${nombre}, se registró correctamente tu salida.`
        );
    }

});


client.login(process.env.DISCORD_TOKEN);   