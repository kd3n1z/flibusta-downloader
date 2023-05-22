import axios from 'axios';
import jsdom from 'jsdom';
import { IBook, IDownloadData, ISearcher, ISearcherInfo } from "../types";

const fantasyworldsSearcher: ISearcher = {
    'mirror': 'https://fantasy-worlds.net',

    'name': 'fantasyworlds',
    'prefix': '📙',
    'priority': 900,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<IBook[] | null> {
        try {
            const resp = await axios.get((this.mirror as string) + '/search/?q=' + encodeURI(query), { timeout: timeout });

            const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.document.querySelectorAll("td>div.news_title>a");

            const result: IBook[] = [];

            for (const link of links) {
                if (limit == 0) {
                    break;
                }

                const href = (link as HTMLElement).getAttribute('href');

                if (href && href.startsWith('/lib/id')) {
                    const id: string = href.split('/')[2].slice(2); // id[id] -> [id]
                    if (!bannedBooks.includes(id)) {
                        result.push({
                            'name': (link.parentElement as HTMLElement).textContent?.trim() as string,
                            'bookId': id
                        });
                        limit--;
                    }
                }
            }

            return result;
        } catch {
            return null;
        }
    },
    'info': function (): ISearcherInfo {
        return {
            'href': this.mirror as string,
            'name': this.name
        };
    },
    getDownloadData: async function (bookId: string, timeout: number): Promise<IDownloadData | null> {
        try {
            const resp = await axios.get((this.mirror as string) + '/lib/id' + bookId, { timeout: timeout });
            const document: Document = new jsdom.JSDOM(resp.data).window.document;
            const title: string = document.querySelectorAll("h1")[0].textContent?.trim() as string;

            return {
                name: title,
                url: (this.mirror as string) + '/lib/id' + bookId + '/download',
                fileExtension: "zip"
            }
        } catch {
            return null;
        }
    }
};

export { fantasyworldsSearcher };