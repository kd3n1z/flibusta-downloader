import axios from 'axios';
import jsdom from 'jsdom';
import { IBook, IDownloadData, ISearcher, ISearcherInfo } from "../types";

const flibustaSearcher: ISearcher = {
    'mirror': 'http://flibusta.is',

    'name': 'flibusta',
    'prefix': '📕',
    'priority': 1000,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<IBook[] | null> {
        try {
            const resp = await axios.get((this.mirror as string) + '/booksearch?ask=' + encodeURI(query), { timeout: timeout });

            const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.document.querySelectorAll("#main>ul>li>a");

            let result: IBook[] = [];

            for (const link of links) {
                if (limit == 0) {
                    break;
                }

                const href = (link as HTMLElement).getAttribute('href');

                if (href && href.startsWith('/b/')) {
                    const id: string = href.split('/')[2];
                    if (!bannedBooks.includes(id)) {
                        result.push({
                            'name': (link.parentElement as HTMLElement).textContent as string,
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
            const resp = await axios.get((this.mirror as string) + '/b/' + bookId, { timeout: timeout });
            const document: Document = new jsdom.JSDOM(resp.data).window.document;
            const title: string = (document.querySelectorAll("#main>a")[0].textContent as string).trim() + " - " + (document.querySelector(".title")?.textContent as string).split('(fb2)')[0].trim();

            let fb2 = false;

            for (let link of document.querySelectorAll('a')) {
                if (link.getAttribute('href') == '/b/' + bookId + '/fb2') {
                    fb2 = true;
                    break;
                }
            }

            if (fb2) {
                return {
                    name: title,
                    url: (this.mirror as string) + '/b/' + bookId + '/fb2',
                    fileExtension: "zip"
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

export { flibustaSearcher };