import { Context, NarrowedContext, Telegraf } from "telegraf";
import { Collection, MatchKeysAndValues, MongoClient, OptionalId, ServerApiVersion } from "mongodb";
import { CallbackQuery, InlineKeyboardButton, Message, Update } from "telegraf/typings/core/types/typegram";
import { ISearcher, IUser } from "./types";

// services
import { flibustaSearcher } from "./services/flibusta";
import { shkolaSearcher } from "./services/shkolainua";

require('dotenv').config();

const mongoClient = new MongoClient(process.env.MONGO_URL as string, { serverApi: ServerApiVersion.v1 });
let usersCollection: Collection<Document> | null = null;

const usedLibs: string = getUsedLibs();
const bot = new Telegraf(process.env.BOT_TOKEN as string);

let bannedBooks: string[] = [];
let busyUsers: string[] = [];

const timeout = 7000;

const searchers: ISearcher[] = [
    flibustaSearcher,
    shkolaSearcher
].sort((a, b) => b.priority - a.priority);

bot.on('message', async (ctx) => {
    handleMessage(ctx);
});

bot.on('callback_query', async (ctx) => {
    handleQuery(ctx);
});

async function handleMessage(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message>>) {
    await addToDatabase(ctx);

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
                    await sendAbout(ctx);
                } else if (text.startsWith("/services")) {
                    await sendServices(ctx);
                } else {
                    ctx.reply('Команда не найдена! 😔');
                }
                return;
            }
            try {
                if (text.length > 100) {
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
                        "Ничего не найдено! 😔 Попробуй проверить список включеных сервисов (/services)."
                    );
                }
            } catch { }
        }
    }
}

async function handleQuery(ctx: NarrowedContext<Context<Update>, Update.CallbackQueryUpdate<CallbackQuery>>) {
    await addToDatabase(ctx);

    try {
        const data: string = (ctx.update.callback_query as any).data;
        if (data) {
            if (data.startsWith('d ')) {
                const user = await getUser(ctx);
                if (user) {
                    updateUser(user.id, { totalBooksDownloaded: user.totalBooksDownloaded + 1 });
                }

                const downloaderName: string = data.split(' ')[1];
                const bookId: string = data.slice(3 + downloaderName.length);
                const msg: Message = await ctx.reply("Загрузка книги " + downloaderName + "/" + bookId + " ⌛");
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

                    for (const searcher of searchers) {
                        if (searcher.name == downloaderName) {
                            const downloadData = await searcher.getDownloadData(bookId, timeout);

                            if (downloadData == null) {
                                await ctx.telegram.editMessageText(
                                    msg.chat.id,
                                    msg.message_id,
                                    undefined,
                                    "Ошибка загрузки! 😔"
                                );
                                removeFromBusy(ctx);
                            } else if (downloadData.url == "ban") {
                                ctx.telegram.editMessageText(
                                    msg.chat.id,
                                    msg.message_id,
                                    undefined,
                                    "Ошибка загрузки - нет доступного файла! 😔"
                                );
                                if (!bannedBooks.includes(bookId)) {
                                    bannedBooks.push(bookId);
                                }
                                removeFromBusy(ctx);
                            } else {
                                await ctx.telegram.editMessageText(
                                    msg.chat.id,
                                    msg.message_id,
                                    undefined,
                                    "Загрузка книги \"" + downloadData.name + "\" ⌛"
                                );

                                ctx.sendChatAction("upload_document");
                                ctx.replyWithDocument({
                                    url: downloadData.url,
                                    filename: downloadData.name.replace(/[^ёа-яa-z0-9-]/gi, "") + "." + downloadData.fileExtension
                                }).then(() => {
                                    ctx.telegram.editMessageText(
                                        msg.chat.id,
                                        msg.message_id,
                                        undefined,
                                        "Загрузка книги \"" + downloadData.name + "\" ✅"
                                    );
                                    removeFromBusy(ctx);
                                });
                            }
                            return;
                        }
                    }

                    removeFromBusy(ctx);

                    await ctx.telegram.editMessageText(
                        msg.chat.id,
                        msg.message_id,
                        undefined,
                        "Ошибка загрузки! 😔 Возможно, книга больше недоступна."
                    );
                } catch { }
            } else if (data == "about") {
                await sendAbout(ctx);
                ctx.answerCbQuery();
            } else if (data.startsWith("s")) {
                try {
                    ctx.answerCbQuery();
                    if (ctx.update.callback_query.message) {
                        const user = await getUser(ctx);

                        if(user) {
                            let updatedSearchers = user.searchers;

                            const disable = data.split(' ')[2] == 'd';
                            const searcherName = data.slice(4); //s e [name] -> [name]
                            
                            if(disable) {
                                updatedSearchers = updatedSearchers.filter((s) => {s != searcherName});
                            }else{
                                if(!updatedSearchers.includes(searcherName)) {
                                    updatedSearchers.push(searcherName);
                                }
                            }
                            
                            await updateUser(user.id, {searchers: updatedSearchers});
    
                            await ctx.telegram.editMessageReplyMarkup(
                                ctx.update.callback_query.message.chat.id,
                                ctx.update.callback_query.message.message_id,
                                undefined,
                                { inline_keyboard: await genServicesKeyboard(ctx) }
                            );
                        }
                    }
                }catch{}
            }
        }
    } catch { }
}

async function addToDatabase(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>) {
    if (!usersCollection || !ctx.from) {
        return;
    }

    const user = await usersCollection.findOne({ id: ctx.from.id });

    if (!user) {
        const userDoc: IUser = { id: ctx.from.id, totalBooksDownloaded: 0, searchers: ['flibusta'] };

        await usersCollection.insertOne(userDoc as any as OptionalId<Document>); // FIXME: (or maybe no...)
    }
}

async function getUser(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>): Promise<IUser | null> {
    if (!usersCollection || !ctx.from) {
        return null;
    }

    let user = await usersCollection.findOne({ id: ctx.from.id }) as any;

    if (user != null) {
        let needToUpdate = false;

        if (!user.searchers) {
            user.searchers = [];
            needToUpdate = true;
        }
        if (!user.totalBooksDownloaded) {
            user.totalBooksDownloaded = 0;
            needToUpdate = true;
        }

        if (needToUpdate) {
            await usersCollection.updateOne({ '_id': user._id }, { $set: user });
        }

        return user as IUser;
    }

    return null;
}

async function updateUser(id: number, set: MatchKeysAndValues<Document> | undefined) {
    if (!usersCollection) {
        return;
    }

    await usersCollection.updateOne({ 'id': id }, { $set: set });
}

function removeFromBusy(ctx: NarrowedContext<Context<Update>, Update.CallbackQueryUpdate<CallbackQuery>>) {
    if (ctx.update.callback_query.message) {
        busyUsers = busyUsers.filter(e => {
            return e != (ctx.update.callback_query.message as any).chat.id.toString();
        });
    }
}

async function sendAbout(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>) {
    let searchersInfo = '';

    for (let searcher of searchers) {
        let info = searcher.info();
        searchersInfo += '\n' + searcher.prefix + ' <a href="' + info.href + '">' + searcher.name + '</a>';
    }

    const userCount = await usersCollection?.countDocuments();

    ctx.reply('Бот разработан <a href="https://github.com/KD3n1z">Денисом Комарьковым</a>\n\nИспользованы библиотеки ' + usedLibs + '\n\nДоступные сервисы:' + searchersInfo + '\n\nВсего пользователей: ' + userCount + '\nMade with ❤️ and <a href="https://www.typescriptlang.org/">TypeScript</a>', {
        parse_mode: "HTML", disable_web_page_preview: true, reply_markup: {
            inline_keyboard: [
                [{ text: "Купить мне кофе ☕️", url: "https://www.buymeacoffee.com/kd3n1z" }]
            ]
        }
    });
}

async function sendServices(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>) {
    let buttons: InlineKeyboardButton[][] = await genServicesKeyboard(ctx);

    await ctx.reply('Сервисы:', {
        reply_markup: {
            inline_keyboard: buttons
        }
    });
}

async function genServicesKeyboard(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>): Promise<InlineKeyboardButton[][]> {
    let buttons: InlineKeyboardButton[][] = [];

    const user = await getUser(ctx);

    if (!user) {
        return [];
    }

    for (let searcher of searchers) {
        const info = searcher.info();
        const enabled = user.searchers.includes(searcher.name);
        buttons.push([{ text: searcher.prefix + " " + info.name + (enabled ? " - включен ✅" : " - выключен ❌"), callback_data: "s " + (enabled ? "d" : "e") + " " + searcher.name }]);
    }

    return buttons;
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

console.log("connecting to mongo...");
if (process.env.MONGO_DB) {
    mongoClient.connect().then(() => {
        usersCollection = mongoClient.db(process.env.MONGO_DB as string).collection("users");
        if (usersCollection == null) {
            console.log("error: users collection is null");
            mongoClient.close();
            return;
        }
        console.log("done, launching bot...");
        bot.launch();
    });
} else {
    console.log("error: db name not specified");
}