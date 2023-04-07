import axios from 'axios';
import jsdom from 'jsdom';
import { Book, ISearcher, ISearcherInfo } from "../types";

const flibustaSearcher: ISearcher = {
    'mirror': 'http://flibusta.is',

    'name': 'flibusta',
    'prefix': '📕',
    'priority': 1000,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<Book[] | null> {
        try {
            const resp = await axios.get((this.mirror as string) + '/booksearch?ask=' + encodeURI(query), { timeout: timeout });

            const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.document.querySelectorAll("#main>ul>li>a");

            let result: Book[] = [];

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
        }
    }
};

export { flibustaSearcher };