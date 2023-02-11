import { Telegraf } from "telegraf";
import jsdom from 'jsdom';
import axios from "axios";
import { InlineKeyboardButton, Message } from "telegraf/typings/core/types/typegram";

require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN as string);

bot.on('message', async (ctx) => {
    if(ctx.update.message.chat.type == 'private') {
        const text = (ctx.update.message as any).text;
        if(text) {
            if(text.startsWith("/")) {  
                if(text.startsWith("/start")) { 
                    ctx.reply('Привет! Этот бот поможет тебе в скачивании книг с <a href="http://flibusta.site/">флибусты</a>.\nПросто введи название книги, например, 1984', {parse_mode: "HTML"});
                }
                return;
            }
            try {
                const msg: Message = await ctx.reply("Ищем книгу \"" + text + "\"...");
                const resp = await axios.get('http://flibusta.site/booksearch?ask=' + encodeURI(text));

                const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.document.querySelectorAll("#main>ul>li>a");
                let limit: number = 5;

                let buttons: InlineKeyboardButton[][] = [];

                for(const link of links) {
                    if(limit == 0) {
                        break;
                    }
                    
                    if((link as HTMLElement).getAttribute('href')) {
                        if(((link as HTMLElement).getAttribute('href') as string).startsWith('/b/')) {
                            buttons.push(
                                [{
                                    text: (link.parentElement as HTMLElement).textContent as string,
                                    callback_data: link.getAttribute('href')?.split('/')[2] as string
                                }]);
                            limit--;
                        }
                    }
                }
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
            } catch {}
        }
    }
});

bot.on('callback_query', async (ctx) => {
    try{
        const data = (ctx.update.callback_query as any).data;
        if(data) {
            const msg: Message = await ctx.reply("Загрузка книги /b/" + data + "...");
            try{
                const resp = await axios.get('http://flibusta.site/b/' + data)
                const document: Document = new jsdom.JSDOM(resp.data).window.document;
                const title: string = (document.querySelectorAll("#main>a")[0].textContent as string).trim() + " - " + (document.querySelector(".title")?.textContent as string).split('(fb2)')[0].trim();
                await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Загрузка книги " + title + "..."
                    );

                let fb2 = false;

                for(let link of document.querySelectorAll('a')) {
                    if(link.getAttribute('href') == '/b/' + data + '/fb2') {
                        fb2 = true;
                        break;
                    }
                }

                if(fb2) {
                    await ctx.replyWithDocument({
                        url: 'http://flibusta.site/b/' + data + '/fb2',
                        filename: title.replace(/[^ёа-яa-z0-9-]/gi, "") + ".zip"
                    });
                }else{
                    ctx.reply("Ошибка загрузки! :(");
                }
                ctx.answerCbQuery();
            }catch {
                await ctx.telegram.editMessageText(
                    msg.chat.id,
                    msg.message_id,
                    undefined,
                    "Ошибка загрузки! :("
                );
            }
        }
    }catch{}
});

bot.launch();