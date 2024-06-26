import { readFileSync, readdirSync } from "fs";
import path from "path";
import { Context, NarrowedContext, Telegraf } from "telegraf";
import { Collection, MatchKeysAndValues, MongoClient, ObjectId, OptionalId, ServerApiVersion } from "mongodb";
import { CallbackQuery, InlineKeyboardButton, Message, Update } from "telegraf/typings/core/types/typegram";
import { ISearcher, IUser, ILanguage } from "./types";

// services
import { flibustaSearcher } from "./services/flibusta";
import { fantasyworldsSearcher } from "./services/fantasyworlds";
import { fourBookSearcher } from "./services/4book";

import "dotenv/config";

const mongoClient = new MongoClient(process.env.MONGO_URL as string, { serverApi: ServerApiVersion.v1 });
let usersCollection: Collection<Document> | null = null;
let booksCollection: Collection<Document> | null = null;

const defaultUser: IUser = { id: -1, totalBooksDownloaded: 0, searchers: ['flibusta'], language: 'russian' };
const usedLibs: string = genUsedLibs();
const bot = new Telegraf(process.env.BOT_TOKEN as string);

const bannedBooks: string[] = [];
let busyUsers: string[] = [];

const timeout = 7000;

const languages = new Map<string, ILanguage>([]);
let deafultLang: ILanguage = {} as ILanguage;

const searchers: ISearcher[] = [
    flibustaSearcher,
    fantasyworldsSearcher,
    fourBookSearcher
].sort((a, b) => b.priority - a.priority);

bot.on('message', async (ctx) => {
    (async () => {
        await handleMessage(ctx);
    })();
});

bot.on('callback_query', async (ctx) => {
    (async () => {
        await handleQuery(ctx);
    })();
});


async function handleMessage(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message>>) {
    const user = await getUser(ctx);

    const language: ILanguage = languages.get(user.language) ?? deafultLang;

    if (ctx.update.message.chat.type == 'private') {
        const text: string = (ctx.update.message as any).text;
        if (text) {
            if (text.startsWith("/")) {
                if (text.startsWith("/start")) {
                    busyUsers = busyUsers.filter(e => {
                        return e != ctx.update.message.chat.id.toString();
                    });
                    ctx.reply(language.start, {
                        parse_mode: "HTML", reply_markup: {
                            inline_keyboard: [
                                [{ text: language.aboutButton, callback_data: "about" }]
                            ]
                        }
                    });
                } else if (text.startsWith("/about")) {
                    await sendAbout(ctx, language);
                } else if (text.startsWith("/donate")) {
                    await sendDonate(ctx, language);
                } else if (text.startsWith("/services")) {
                    await sendServices(ctx, language);
                } else if (text.startsWith("/lang")) {
                    await sendLanguages(ctx);
                } else {
                    ctx.reply(language.errorCommandNotFound);
                }
                return;
            }
            try {
                if (text.length > 100) {
                    await ctx.reply(language.errorQueryTooLong);
                    return;
                }

                const msg: Message = await ctx.reply(language.searching.replaceAll("%query", (text.length <= 20 ? text : text.slice(0, 20) + "...")));

                const limit = 5;

                const buttons: InlineKeyboardButton[][] = [];

                for (const searcher of searchers) {
                    if (buttons.length >= limit) {
                        break;
                    }

                    if (user && !user.searchers.includes(searcher.name)) {
                        continue;
                    }

                    const books = await searcher.search(text, limit - buttons.length, bannedBooks, timeout);

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
                        language.bookMenu
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
                        language.notFound
                    );
                }
            } catch { }
        }
    }
}

async function handleQuery(ctx: NarrowedContext<Context<Update>, Update.CallbackQueryUpdate<CallbackQuery>>) {
    const user = await getUser(ctx);
    const data: string = (ctx.update.callback_query as any).data;

    const language: ILanguage = languages.get(user.language) ?? deafultLang;

    if (data) {
        if (data.startsWith('d ')) {
            if (user) {
                await updateUser(user.id, { totalBooksDownloaded: user.totalBooksDownloaded + 1 });
            }

            const downloaderName: string = data.split(' ')[1];
            const bookId: string = data.slice(3 + downloaderName.length);
            const msg: Message = await ctx.reply(language.downloading.replaceAll("%bookName", downloaderName + "/" + bookId));
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
                            language.errorAlreadyDownloading
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
                                language.errorDownloadFailed
                            );
                            removeFromBusy(ctx);
                        } else if (downloadData.url == "ban") {
                            ctx.telegram.editMessageText(
                                msg.chat.id,
                                msg.message_id,
                                undefined,
                                language.errorNotAvailable
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
                                language.downloading.replaceAll("%bookName", '"' + downloadData.name + '"')
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
                                    language.downloaded.replaceAll("%bookName", '"' + downloadData.name + '"')
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
                    language.errorNotAvailableAnymore
                );
            } catch { }
        } else if (data == "about") {
            await sendAbout(ctx, language);
            ctx.answerCbQuery();
        } else if (data == "donate") {
            await sendDonate(ctx, language);
            ctx.answerCbQuery();
        } else if (data.startsWith("sl ")) { // set language
            if (ctx.update.callback_query.message) {
                user.language = data.slice(3); //sl english -> english
                await updateUser(user.id, { language: user.language });
                await ctx.telegram.editMessageText(
                    ctx.update.callback_query.message.chat.id,
                    ctx.update.callback_query.message.message_id,
                    undefined,
                    await genCurrentLangText(ctx),
                    {
                        reply_markup: {
                            inline_keyboard: genLangButtons()
                        }
                    }
                );
                ctx.answerCbQuery();
            }
        } else if (data.startsWith("s ")) { // service enable/disable
            if (ctx.update.callback_query.message) {
                if (user) {
                    const disable = data.split(' ')[1] == 'd';
                    const searcherName = data.slice(4); //s e/d [name] -> [name]

                    if (disable) {
                        user.searchers = user.searchers.filter(e => {
                            return e != searcherName;
                        });
                    } else {
                        if (!user.searchers.includes(searcherName)) {
                            user.searchers.push(searcherName);
                        }
                    }

                    await updateUser(user.id, { searchers: user.searchers });

                    await ctx.telegram.editMessageReplyMarkup(
                        ctx.update.callback_query.message.chat.id,
                        ctx.update.callback_query.message.message_id,
                        undefined,
                        { inline_keyboard: await genServicesKeyboard(user, language) }
                    );
                    ctx.answerCbQuery();
                }
            }
        }
    }
}

async function getUser(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>): Promise<IUser> {
    if (!usersCollection || !ctx.from) {
        return { ...defaultUser };
    }

    const user = await usersCollection.findOne({ id: ctx.from.id }) as any;

    if (user != null) {
        let needToUpdate = false;

        for (const key of Object.keys(defaultUser)) {
            if (user[key] == null) {
                user[key] = (defaultUser as any)[key];
                needToUpdate = true;
            }
        }

        if (needToUpdate) {
            await usersCollection.updateOne({ '_id': user._id }, { $set: user });
        }

        return user as IUser;
    }

    const userDoc: IUser = { ...defaultUser };
    userDoc.id = ctx.from.id;
    await usersCollection.insertOne(userDoc as any as OptionalId<Document>);

    return await usersCollection.findOne({ id: ctx.from.id }) as any;
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

async function sendAbout(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>, language: ILanguage) {
    let searchersInfo = '';

    for (const searcher of searchers) {
        const info = searcher.info();
        searchersInfo += '\n' + searcher.prefix + ' <a href="' + info.href + '">' + searcher.name + '</a>';
    }

    const userCount = await usersCollection?.countDocuments();

    ctx.reply(
        language.about
            .replaceAll('%usedLibs', usedLibs.replaceAll('%usedLibsAnd', language.usedLibsAnd))
            .replaceAll('%searchersInfo', searchersInfo)
            .replaceAll('%userCount', userCount + ""), {
        parse_mode: "HTML", disable_web_page_preview: true, reply_markup: {
            inline_keyboard: [
                [{ text: language.donateButton, callback_data: "donate" }]
            ]
        }
    });
}

async function sendDonate(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>, language: ILanguage) {
    ctx.reply(language.donation, { parse_mode: "HTML" });
}

async function sendServices(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>, language: ILanguage) {
    const buttons: InlineKeyboardButton[][] = genServicesKeyboard(await getUser(ctx), language);

    await ctx.reply(language.services, {
        reply_markup: {
            inline_keyboard: buttons
        }
    });
}

async function sendLanguages(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>) {
    const buttons: InlineKeyboardButton[][] = genLangButtons();

    await ctx.reply(await genCurrentLangText(ctx), {
        reply_markup: {
            inline_keyboard: buttons
        }
    });
}

function genLangButtons() {
    const buttons: InlineKeyboardButton[][] = [];

    for (const key of languages.keys()) {
        const lang = languages.get(key);

        if (!lang) {
            continue;
        }

        buttons.push([{
            text: lang.displayName,
            callback_data: "sl " + key
        }]);
    }

    return buttons;
}

async function genCurrentLangText(ctx: NarrowedContext<Context<Update>, Update.MessageUpdate<Message> | Update.CallbackQueryUpdate<CallbackQuery>>) {
    const language = languages.get((await getUser(ctx)).language) ?? deafultLang;

    return language.currentLang.replaceAll("%lang", language.displayName)
}

function genServicesKeyboard(user: IUser | null, language: ILanguage): InlineKeyboardButton[][] {
    const buttons: InlineKeyboardButton[][] = [];

    if (user == null) {
        return [];
    }

    for (const searcher of searchers) {
        const info = searcher.info();
        const enabled = user.searchers.includes(searcher.name);
        buttons.push([{ text: searcher.prefix + " " + (enabled ? language.serviceEnabled.replaceAll('%service', info.name) : language.serviceDisabled.replaceAll('%service', info.name)), callback_data: "s " + (enabled ? "d" : "e") + " " + searcher.name }]);
    }

    return buttons;
}

function genUsedLibs(): string {
    let result = '';
    const libs: string[] = Object.keys(JSON.parse(readFileSync('package.json', { encoding: 'utf-8' })).dependencies);
    const lastLib: string = libs.pop() as string;

    for (const lib of libs) {
        if (!lib.startsWith('@')) {
            result += '<a href="https://www.npmjs.com/package/' + lib + '">' + lib + '</a>, ';
        }
    }

    return result.slice(0, result.length - 2) + '%usedLibsAnd <a href="https://www.npmjs.com/package/' + lastLib + '">' + lastLib + '</a>';
}

export async function reserveUrl(url: string): Promise<string> {
    if (!booksCollection) {
        return "null";
    }

    const book = await booksCollection.findOne({ url: url });

    if (book != null) {
        return book._id.toString();
    } else {
        return (await booksCollection.insertOne({ url: url } as any as OptionalId<Document>)).insertedId.toString();
    }
}

export async function getReservedUrl(id: string): Promise<string | null> {
    if (!booksCollection) {
        return null;
    }

    const book = await booksCollection.findOne({ _id: new ObjectId(id) });

    if (book == null) {
        return null;
    } else {
        return (book as any).url;
    }
}

function startBot() {
    console.log("parsing languages...");
    for (const file of readdirSync("languages")) {
        console.log("\t" + file + "...");
        const lang: ILanguage = JSON.parse(readFileSync(path.join("languages", file), { encoding: 'utf-8' }));
        languages.set(path.basename(file).split('.')[0], lang);
        if (lang.default) {
            deafultLang = lang;
            console.log("\t\t- default");
        }
    }

    if (deafultLang) {
        console.log("connecting to mongo...");
        if (process.env.MONGO_DB) {
            mongoClient.connect().then(() => {
                const db = mongoClient.db(process.env.MONGO_DB as string);

                usersCollection = db.collection("users");
                if (usersCollection == null) {
                    console.log("error: users collection is null");
                    mongoClient.close();
                    return;
                }

                booksCollection = db.collection("books");
                if (booksCollection == null) {
                    console.log("error: books collection is null");
                    mongoClient.close();
                    return;
                }

                console.log("done, launching bot...");

                process.on('uncaughtException', function (exception) {
                    console.error("unhandled error: " + exception);
                });
                bot.launch();
            });
        } else {
            console.log("error: db name not specified");
        }
    } else {
        console.log("error: no default language");
    }
}

startBot();