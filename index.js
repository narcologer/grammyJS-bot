require('dotenv').config();
const { Telegraf, session, Markup } = require('telegraf');
const nodemailer = require('nodemailer');
const mysql = require('mysql');

// Проверка наличия переменных окружения
if (!process.env.BOT_API_KEY || !process.env.BOT_APP_USER || !process.env.BOT_APP_PASS || !process.env.BOT_DOC_EMAIL) {
    console.error("Отсутствуют необходимые переменные окружения.");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_API_KEY);

const pool  = mysql.createPool({
    connectionLimit : 10,
    host            : process.env.DB_HOST,
    user            : process.env.DB_USER,
    password        : process.env.DB_PASS,
    database        : process.env.DB_DB
});

const transporter = nodemailer.createTransport({
    secure: true,
    host: 'smtp.gmail.com',
    port: 465,
    auth: {
        user: process.env.BOT_APP_USER,
        pass: process.env.BOT_APP_PASS
    }
});

function initialSessionData() {
    return {
        patientName: "",
        patientPhone: ""
    };
}

// Инициализация сессии
bot.use(session({
    defaultSession: initialSessionData
}));

// Установка команд бота
bot.telegram.setMyCommands([
    {
        command: 'start',
        description: 'Запуск бота',
    }
]);

// Обработка команды /start
bot.start(async (ctx) => {
    pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.query('SELECT name FROM courses', async (err, rows) => {
            connection.release();
            if (!err) {
                const menuButtons = rows.map(row => [Markup.button.callback(row.name, row.name)]);
                await ctx.reply('Выберите курс ', Markup.inlineKeyboard(menuButtons));
            } else {
                console.log(err);
            }
        });
    });
});

// Обработка текстовых сообщений от пользователя
bot.on("text", async (ctx) => {
    if (ctx.session.patientPhone === "") {
        ctx.session.patientPhone = ctx.message.text;
        const menuKeyboard = Markup.inlineKeyboard([
            Markup.button.callback(`Да`, `yes`),
            Markup.button.callback(`Нет`, `no`)
        ]);
        await ctx.reply(
            `Курс: ${ctx.session.patientName}, телефон: ${ctx.session.patientPhone}. Все верно?`,
            menuKeyboard
        );
    } else {
        await ctx.reply(`Данные заполнены, выберите верны они или нет`);
    }
});

// Обработка нажатия на кнопку "Нет" для сброса данных
bot.action('no', async (ctx) => {
    ctx.session.patientName = "";
    ctx.session.patientPhone = "";
    pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.query('SELECT name FROM courses', async (err, rows) => {
            connection.release();
            if (!err) {
                const menuButtons = rows.map(row => [Markup.button.callback(row.name, row.name)]);
                await ctx.reply('Выберите курс ', Markup.inlineKeyboard(menuButtons));
            } else {
                console.log(err);
            }
        });
    });
});

// Обработка нажатия на кнопку "Да" для отправки данных по почте
bot.action('yes', async (ctx) => {
    try {
        await transporter.sendMail({
            to: process.env.BOT_DOC_EMAIL,
            subject: 'Новая запись',
            html: `Курс: ${ctx.session.patientName}, телефон: ${ctx.session.patientPhone}.`
        });
        ctx.session.patientName = "";
        ctx.session.patientPhone = "";
        await ctx.reply(`Письмо отправлено`);
    } catch (error) {
        console.error("Ошибка при отправке письма:", error);
        await ctx.reply("Не удалось отправить письмо. Пожалуйста, попробуйте позже.");
    }
});

// Обработка callback-запроса на выбор курса
bot.on('callback_query', async (ctx) => {
    ctx.session.patientName = ctx.callbackQuery.data;
    await ctx.reply(`Введите телефон`);
});

// Обработка ошибок
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id};`);
    const e = err.error;
    console.error("Unknown error:", e);
});

// Запуск бота
bot.launch();