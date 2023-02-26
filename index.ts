import { Context, NarrowedContext, Telegraf } from "telegraf";
import jsdom from 'jsdom';
import axios from "axios";
import { CallbackQuery, InlineKeyboardButton, Message, Update } from "telegraf/typings/core/types/typegram";

require('dotenv').config();

let usedLibs: string = getUsedLibs();

const bot = new Telegraf(process.env.BOT_TOKEN as string);

const domain: string = 'http://flibusta.is';

let bannedBooks: string[] = [];

let busyUsers: string[] = [];

bot.on('message', async (ctx) => {
    if(ctx.update.message.chat.type == 'private') {
        const text: string = (ctx.update.message as any).text;
        if(text) {
            if(text.startsWith("/")) {  
                if(text.startsWith("/start")) {
                    busyUsers = busyUsers.filter(e => {
                        return e != ctx.update.message.chat.id.toString();
                    });
                    ctx.reply('Привет! 👋 Я помогу тебе в скачивании книг с <a href="' + domain + '">флибусты</a>. 📚 Просто отправь мне название любой книги, например, 1984 📕', {parse_mode: "HTML", reply_markup: {
                        inline_keyboard: [
                            [{text: "Про бота", callback_data: "about"}]
                        ]
                    }});
                }else if(text.startsWith("/about")) {
                    sendAbout(ctx);
                }else{
                    ctx.reply('Команда не найдена! 😔');
                }
                return;
            }
            try {
                const msg: Message = await ctx.reply("Ищем книгу \"" + (text.length <= 20 ? text : text.slice(0, 20) + "...") + "\" ⌛");
                const resp = await axios.get(domain + '/booksearch?ask=' + encodeURI(text));

                const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.document.querySelectorAll("#main>ul>li>a");
                let limit: number = 5;

                let buttons: InlineKeyboardButton[][] = [];

                for(const link of links) {
                    if(limit == 0) {
                        break;
                    }
                    
                    if((link as HTMLElement).getAttribute('href')) {
                        if(((link as HTMLElement).getAttribute('href') as string).startsWith('/b/')) {
                            let id: string = link.getAttribute('href')?.split('/')[2] as string;
                            if(!bannedBooks.includes(id)) {
                                buttons.push(
                                    [{
                                        text: '📕 ' + (link.parentElement as HTMLElement).textContent as string,
                                        callback_data: "d " + id
                                    }]);
                                limit--;
                            }
                        }
                    }
                }
                if(buttons.length > 0) {
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
                        {inline_keyboard: buttons}
                    );
                }else{
                    await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Ничего не найдено! 😔"
                    );
                }
            } catch {}
        }
    }
});

bot.on('callback_query', async (ctx) => {
    try{
        const data = (ctx.update.callback_query as any).data;
        if(data) {
            if(data.startsWith('d ')) {
                let bookId: string = data.slice(2);
                const msg: Message = await ctx.reply("Загрузка книги /b/" + bookId + " ⌛");
                try{
                    ctx.answerCbQuery();
                    if(ctx.update.callback_query.message) {
                        if(!busyUsers.includes(ctx.update.callback_query.message.chat.id.toString())) {
                            busyUsers.push(ctx.update.callback_query.message.chat.id.toString());
                        }else{
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
                    const resp = await axios.get(domain + '/b/' + bookId);
                    const document: Document = new jsdom.JSDOM(resp.data).window.document;
                    const title: string = (document.querySelectorAll("#main>a")[0].textContent as string).trim() + " - " + (document.querySelector(".title")?.textContent as string).split('(fb2)')[0].trim();
                    await ctx.telegram.editMessageText(
                            msg.chat.id,
                            msg.message_id,
                            undefined,
                            "Загрузка книги \"" + title + "\" ⌛"
                        );

                    let fb2 = false;

                    for(let link of document.querySelectorAll('a')) {
                        if(link.getAttribute('href') == '/b/' + bookId + '/fb2') {
                            fb2 = true;
                            break;
                        }
                    }

                    if(fb2) {
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
                    }else{
                        ctx.telegram.editMessageText(
                            msg.chat.id,
                            msg.message_id,
                            undefined,
                            "Ошибка загрузки - нет доступного файла! 😔"
                        );
                        removeFromBusy(ctx);
                        if(!bannedBooks.includes(bookId)) {
                            bannedBooks.push(bookId);
                        }
                    }
                }catch {
                    await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Ошибка загрузки! 😔"
                    );
                    removeFromBusy(ctx);
                }
            }else if(data == "about") {
                sendAbout(ctx);
                ctx.answerCbQuery();
            }
        }
    }catch{}
});

function removeFromBusy(ctx: NarrowedContext<Context<Update>, Update.CallbackQueryUpdate<CallbackQuery>>) {
    if(ctx.update.callback_query.message) {
        busyUsers = busyUsers.filter(e => {
            return e != (ctx.update.callback_query.message as any).chat.id.toString();
        });
    }
}

function sendAbout(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>) {
    ctx.reply('Бот разработан <a href="https://github.com/KD3n1z">Денисом Комарьковым</a>\n\nИспользованы библиотеки ' + usedLibs + '\n\nMade with ❤️ and <a href="https://www.typescriptlang.org/">TypeScript</a>', {
        parse_mode: "HTML", disable_web_page_preview: true, reply_markup: {
        inline_keyboard: [
            [{text: "Купить мне кофе ☕️", url: "https://www.buymeacoffee.com/kd3n1z"}]
        ]
    }});
}

function getUsedLibs(): string {
    let result: string = '';
    let libs: string[] = Object.keys(require('./package.json').dependencies);
    let lastLib: string = libs.pop() as string;
    
    for(let lib of libs) {
        if(!lib.startsWith('@')) {
            result += '<a href="https://www.npmjs.com/package/' + lib + '">' + lib + '</a>, ';
        }
    }
    
    return result.slice(0, result.length - 2) + ' и <a href="https://www.npmjs.com/package/' + lastLib + '">' + lastLib + '</a>';
}

console.log("bot started");

bot.launch();