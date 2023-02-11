"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const jsdom_1 = __importDefault(require("jsdom"));
const axios_1 = __importDefault(require("axios"));
require('dotenv').config();
const bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
bot.on('message', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (ctx.update.message.chat.type == 'private') {
        const text = ctx.update.message.text;
        if (text) {
            if (text.startsWith("/")) {
                if (text.startsWith("/start")) {
                    ctx.reply('Привет! Этот бот поможет тебе в скачивании книг с <a href="http://flibusta.site/">флибусты</a>.\nПросто введи название книги, например, 1984', { parse_mode: "HTML" });
                }
                return;
            }
            try {
                const msg = yield ctx.reply("Ищем книгу \"" + text + "\"...");
                const resp = yield axios_1.default.get('http://flibusta.site/booksearch?ask=' + encodeURI(text));
                const links = new jsdom_1.default.JSDOM(resp.data).window.document.querySelectorAll("#main>ul>li>a");
                let limit = 5;
                let buttons = [];
                for (const link of links) {
                    if (limit == 0) {
                        break;
                    }
                    if (link.getAttribute('href')) {
                        if (link.getAttribute('href').startsWith('/b/')) {
                            buttons.push([{
                                    text: link.parentElement.textContent,
                                    callback_data: (_a = link.getAttribute('href')) === null || _a === void 0 ? void 0 : _a.split('/')[2]
                                }]);
                            limit--;
                        }
                    }
                }
                yield ctx.telegram.editMessageText(msg.chat.id, msg.message_id, undefined, "Выберите книгу...");
                yield ctx.telegram.editMessageReplyMarkup(msg.chat.id, msg.message_id, undefined, { inline_keyboard: buttons });
            }
            catch (_b) { }
        }
    }
}));
bot.on('callback_query', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    try {
        const data = ctx.update.callback_query.data;
        if (data) {
            const msg = yield ctx.reply("Загрузка книги /b/" + data + "...");
            try {
                const resp = yield axios_1.default.get('http://flibusta.site/b/' + data);
                const document = new jsdom_1.default.JSDOM(resp.data).window.document;
                const title = document.querySelectorAll("#main>a")[0].textContent.trim() + " - " + ((_c = document.querySelector(".title")) === null || _c === void 0 ? void 0 : _c.textContent).split('(fb2)')[0].trim();
                yield ctx.telegram.editMessageText(msg.chat.id, msg.message_id, undefined, "Загрузка книги " + title + "...");
                let fb2 = false;
                for (let link of document.querySelectorAll('a')) {
                    if (link.getAttribute('href') == '/b/' + data + '/fb2') {
                        fb2 = true;
                        break;
                    }
                }
                if (fb2) {
                    yield ctx.replyWithDocument({
                        url: 'http://flibusta.site/b/' + data + '/fb2',
                        filename: title.replace(/[^ёа-яa-z0-9-]/gi, "") + ".zip"
                    });
                }
                else {
                    ctx.reply("Ошибка загрузки! :(");
                }
                ctx.answerCbQuery();
            }
            catch (_d) {
                yield ctx.telegram.editMessageText(msg.chat.id, msg.message_id, undefined, "Ошибка загрузки! :(");
            }
        }
    }
    catch (_e) { }
}));
bot.launch();
