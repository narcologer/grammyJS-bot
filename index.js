require('dotenv').config();
const { Bot, session, InlineKeyboard } = require('grammy');
const nodemailer = require('nodemailer');
const { hydrate } = require('@grammyjs/hydrate');

// Проверка наличия переменных окружения
if (!process.env.BOT_API_KEY || !process.env.BOT_APP_USER || !process.env.BOT_APP_PASS || !process.env.BOT_DOC_EMAIL) {
    console.error("Отсутствуют необходимые переменные окружения.");
    process.exit(1);
}

const bot = new Bot(process.env.BOT_API_KEY);
bot.use(hydrate());

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
bot.use(session({ initial: initialSessionData }));

// Установка команд бота
bot.api.setMyCommands([
    {
        command: 'start',
        description: 'Запуск бота',
    }
]);

// Обработка команды /start
bot.command('start', async (ctx) => {
    await ctx.reply(`Введите ваше ФИО`);
});

// Обработка текстовых сообщений от пользователя
bot.on("message:text", async (ctx) => {
    if (ctx.session.patientName === "") {
        // Сохранение ФИО и запрос телефона
        ctx.session.patientName = ctx.message.text;
        await ctx.reply(`Введите ваш телефон`);
    } else if (ctx.session.patientPhone === "") {
        // Сохранение телефона и запрос подтверждения
        ctx.session.patientPhone = ctx.message.text;
        const menuKeyboard = new InlineKeyboard()
            .text(`Да`, `yes`)
            .text(`Нет`, `no`);
        await ctx.reply(
            `ФИО: ${ctx.session.patientName}, телефон: ${ctx.session.patientPhone}. Все верно?`,
            { reply_markup: menuKeyboard }
        );
    } else {
        await ctx.reply(`Данные заполнены, выберите верны они или нет`);
    }
});

// Обработка нажатия на кнопку "Нет" для сброса данных
bot.callbackQuery(['no'], async (ctx) => {
    ctx.session.patientName = "";
    ctx.session.patientPhone = "";
    await ctx.reply(`Введите ваше ФИО`);
});

// Обработка нажатия на кнопку "Да" для отправки данных по почте
bot.callbackQuery(['yes'], async (ctx) => {
    try {
        await transporter.sendMail({
            to: process.env.BOT_DOC_EMAIL,
            subject: 'Новая запись',
            html: `ФИО: ${ctx.session.patientName}, телефон: ${ctx.session.patientPhone}.`
        });
        // Очистка данных после успешной отправки
        ctx.session.patientName = "";
        ctx.session.patientPhone = "";
        await ctx.reply(`Письмо отправлено`);
    } catch (error) {
        console.error("Ошибка при отправке письма:", error);
        await ctx.reply("Не удалось отправить письмо. Пожалуйста, попробуйте позже.");
    }
});

// Обработка ошибок
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id};`);
    const e = err.error;

    if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
});

// Запуск бота
bot.start();