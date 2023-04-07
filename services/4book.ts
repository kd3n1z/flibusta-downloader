// TODO: finish or completely remove :)

import axios from 'axios';
import jsdom from 'jsdom';
import { Book, ISearcher, ISearcherInfo } from "../types";

const fourbookSearcher: ISearcher = {
    'mirror': 'https://4book.org',

    'name': '4book',
    'prefix': '📒',
    'priority': 100,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<Book[] | null> {
        try {
            const resp = await axios.get((this.mirror as string) + '/search?section=textbook&search=' + encodeURI(query), { timeout: timeout });

            const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.document.querySelectorAll('.container>.row a');

            let result: Book[] = [];

            for (const link of links) {
                if (limit == 0) {
                    break;
                }

                const href = (link as HTMLElement).getAttribute('href');

                if (href && href.startsWith('/uchebniki-ukraina/')) {
                    const id: string = href.slice('/uchebniki-ukraina/'.length);
                    if (!bannedBooks.includes(id)) {
                        result.push({
                            'name': (link.querySelector("span.title") as HTMLElement).textContent as string,
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

export { fourbookSearcher };