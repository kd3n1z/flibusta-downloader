import { Context, NarrowedContext, Telegraf } from "telegraf";
import jsdom from 'jsdom';
import axios from 'axios';
import { CallbackQuery, InlineKeyboardButton, Message, Update } from "telegraf/typings/core/types/typegram";
import { ISearcher } from "./types";

// services
import { flibustaSearcher } from "./services/flibusta";
import { shkolaSearcher } from "./services/shkolainua";

require('dotenv').config();

let usedLibs: string = getUsedLibs();

const bot = new Telegraf(process.env.BOT_TOKEN as string);

let bannedBooks: string[] = [];

let busyUsers: string[] = [];

const timeout = 7000;

const searchers: ISearcher[] = [flibustaSearcher, shkolaSearcher].sort((a, b) => b.priority - a.priority);

bot.on('message', async (ctx) => {
    handleMessage(ctx);
});

bot.on('callback_query', async (ctx) => {
    handleQuery(ctx);
});

async function handleMessage(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message>>) {
    if (ctx.update.message.chat.type == 'private') {
        const text: string = (ctx.update.message as any).text;
        if (text) {
            if (text.startsWith("/")) {
                if (text.startsWith("/start")) {
                    busyUsers = busyUsers.filter(e => {
                        return e != ctx.update.message.chat.id.toString();
                    });
                    ctx.reply('Привет! 👋 Я помогу тебе в скачивании книг с <a href="https://flibusta.is/">флибусты</a> и других сервисов (/services). 📚 Просто отправь мне название любой книги, например, 1984 📕', {
                        parse_mode: "HTML", reply_markup: {
                            inline_keyboard: [
                                [{ text: "Про бота", callback_data: "about" }]
                            ]
                        }
                    });
                } else if (text.startsWith("/about")) {
                    sendAbout(ctx);
                } else {
                    ctx.reply('Команда не найдена! 😔');
                }
                return;
            }
            try {
                if(text.length > 100) {
                    await ctx.reply("❌ Запрос слишком длинный.");
                    return;
                }

                const msg: Message = await ctx.reply("Ищем книгу \"" + (text.length <= 20 ? text : text.slice(0, 20) + "...") + "\" ⌛");

                const limit = 5;

                let buttons: InlineKeyboardButton[][] = [];

                for (const searcher of searchers) {
                    if (buttons.length >= limit) {
                        break;
                    }

                    const books = await searcher.search(text, limit, bannedBooks, timeout);

                    if (books == null) {
                        continue;
                    }

                    for (const book of books) {
                        if (buttons.length >= limit) {
                            break;
                        }
                        buttons.push(
                            [{
                                text: searcher.prefix + ' ' + book.name,
                                callback_data: "d " + searcher.name + " " + book.bookId
                            }]);
                    }
                }
                if (buttons.length > 0) {
                    await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Выберите книгу..."
                    );
                    await ctx.telegram.editMessageReplyMarkup(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        { inline_keyboard: buttons }
                    );
                } else {
                    await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Ничего не найдено! 😔"
                    );
                }
            } catch { }
        }
    }
}

async function handleQuery(ctx: NarrowedContext<Context<Update>, Update.CallbackQueryUpdate<CallbackQuery>>) {
    try {
        const data: string = (ctx.update.callback_query as any).data;
        if (data) {
            if (data.startsWith('d ')) {
                const downloaderName = data.split(' ')[1];
                const bookId: string = data.slice(3 + downloaderName.length);
                const msg: Message = await ctx.reply("Загрузка книги " + bookId + " ⌛");
                try {
                    ctx.answerCbQuery();
                    if (ctx.update.callback_query.message) {
                        if (!busyUsers.includes(ctx.update.callback_query.message.chat.id.toString())) {
                            busyUsers.push(ctx.update.callback_query.message.chat.id.toString());
                        } else {
                            ctx.telegram.editMessageText(
                                msg.chat.id,
                                msg.message_id,
                                undefined,
                                'Вы не можете скачивать две книги одновременно ❌'
                            );
                            return;
                        }

                        await ctx.telegram.deleteMessage(ctx.update.callback_query.message.chat.id, ctx.update.callback_query.message.message_id);
                    }
                    
                    for(const searcher of searchers) {
                        
                    }

                    const resp = await axios.get(domain + '/b/' + bookId, { timeout: timeout });
                    const document: Document = new jsdom.JSDOM(resp.data).window.document;
                    const title: string = (document.querySelectorAll("#main>a")[0].textContent as string).trim() + " - " + (document.querySelector(".title")?.textContent as string).split('(fb2)')[0].trim();
                    await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Загрузка книги \"" + title + "\" ⌛"
                    );

                    let fb2 = false;

                    for (let link of document.querySelectorAll('a')) {
                        if (link.getAttribute('href') == '/b/' + bookId + '/fb2') {
                            fb2 = true;
                            break;
                        }
                    }

                    if (fb2) {
                        ctx.sendChatAction("upload_document");
                        ctx.replyWithDocument({
                            url: domain + '/b/' + bookId + '/fb2',
                            filename: title.replace(/[^ёа-яa-z0-9-]/gi, "") + ".zip"
                        }).then(() => {
                            ctx.telegram.editMessageText(
                                msg.chat.id,
                                msg.message_id,
                                undefined,
                                "Загрузка книги \"" + title + "\" ✅"
                            );
                            removeFromBusy(ctx);
                        });
                    } else {
                        ctx.telegram.editMessageText(
                            msg.chat.id,
                            msg.message_id,
                            undefined,
                            "Ошибка загрузки - нет доступного файла! 😔\nЭта книга больше не появтся в списке."
                        );
                        removeFromBusy(ctx);
                        if (!bannedBooks.includes(bookId)) {
                            bannedBooks.push(bookId);
                        }
                    }
                } catch {
                    await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Ошибка загрузки! 😔"
                    );
                    removeFromBusy(ctx);
                }
            } else if (data == "about") {
                sendAbout(ctx);
                ctx.answerCbQuery();
            }
        }
    } catch { }
}

function removeFromBusy(ctx: NarrowedContext<Context<Update>, Update.CallbackQueryUpdate<CallbackQuery>>) {
    if (ctx.update.callback_query.message) {
        busyUsers = busyUsers.filter(e => {
            return e != (ctx.update.callback_query.message as any).chat.id.toString();
        });
    }
}

function sendAbout(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>) {
    let searchersInfo = '';

    for (let searcher of searchers) {
        let info = searcher.info();
        searchersInfo += '\n' + searcher.prefix + ' <a href="' + info.href + '">' + searcher.name + '</a>';
    }

    ctx.reply('Бот разработан <a href="https://github.com/KD3n1z">Денисом Комарьковым</a>\n\nИспользованы библиотеки ' + usedLibs + '\n\nДоступные сервисы:' + searchersInfo + '\n\nMade with ❤️ and <a href="https://www.typescriptlang.org/">TypeScript</a>', {
        parse_mode: "HTML", disable_web_page_preview: true, reply_markup: {
            inline_keyboard: [
                [{ text: "Купить мне кофе ☕️", url: "https://www.buymeacoffee.com/kd3n1z" }]
            ]
        }
    });
}

function getUsedLibs(): string {
    let result: string = '';
    let libs: string[] = Object.keys(require('./package.json').dependencies);
    let lastLib: string = libs.pop() as string;

    for (let lib of libs) {
        if (!lib.startsWith('@')) {
            result += '<a href="https://www.npmjs.com/package/' + lib + '">' + lib + '</a>, ';
        }
    }

    return result.slice(0, result.length - 2) + ' и <a href="https://www.npmjs.com/package/' + lastLib + '">' + lastLib + '</a>';
}

console.log("bot started");

bot.launch();