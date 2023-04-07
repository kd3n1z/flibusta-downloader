import axios from 'axios';
import jsdom from 'jsdom';
import { IBook, IDownloadData, ISearcher, ISearcherInfo } from "../types";

const shkolaSearcher: ISearcher = {
    'mirror': 'https://shkola.in.ua',

    'name': 'shkola',
    'prefix': '📒',
    'priority': 100,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<IBook[] | null> {
        try {
            const resp = await axios.post((this.mirror as string) + '/search.html?ordering=&areas[0]=content&searchphrase=all&tmpl=raw&type=json', { "searchword": encodeURI(query) }, {
                headers: {
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                }, timeout: timeout
            });

            let result: IBook[] = [];

            for (const book of resp.data.results) {
                if (limit == 0) {
                    break;
                }
                const id: string = book.url.slice(1).slice(0, -5); // /[id].html -> [id]
                if (bannedBooks.includes(id) || id.length > 64 - 'd shkola '.length) {
                    continue;
                }

                result.push({
                    'name': book.title,
                    'bookId': id
                });
                limit--;
            }

            return result;
        } catch {
            return null;
        }
    },
    'info': function (): ISearcherInfo {
        return {
            'href': this.mirror as string,
            'name': 'shkola.in.ua'
        };
    },
    getDownloadData: async function (bookId: string, timeout: number): Promise<IDownloadData | null> {
        try {
            const resp = await axios.get((this.mirror as string) + '/' + bookId + '.html', { timeout: timeout });
            const document: Document = new jsdom.JSDOM(resp.data).window.document;
            const url: string | undefined | null = document.querySelectorAll("a.button1")[0]?.getAttribute("href");
            const title: string | undefined | null = (document.querySelectorAll("h1")[0] as (HTMLElement | null))?.textContent?.trim();

            if(url && title) {
                return {
                    name: title,
                    url: url,
                    fileExtension: "pdf"
                }
            }

            return {
                name: "ban",
                url: "ban",
                fileExtension: "ban"
            }
        } catch {
            return null;
        }
    }
};

export { shkolaSearcher };