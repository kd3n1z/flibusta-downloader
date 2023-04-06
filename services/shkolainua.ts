import axios from 'axios';
import { Book, ISearcher, ISearcherInfo } from "../types";

const shkolaSearcher: ISearcher = {
    'mirror': 'https://shkola.in.ua',

    'name': 'shkola',
    'prefix': '📒',
    'priority': 100,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<Book[] | null> {
        try {
            const resp = await axios.post((this.mirror as string) + '/search.html?ordering=&searchphrase=all&tmpl=raw&type=json', { "searchword": encodeURI(query) }, {
                headers: {
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                }, timeout: timeout
            });

            let result: Book[] = [];

            for (const book of resp.data.results) {
                if (limit == 0) {
                    break;
                }
                const id: string = book.url.slice(1).slice(0, -5);
                if (bannedBooks.includes(id) || id.length > 64 - 'd shkola '.length) {
                    continue;
                }
                console.log(id);
                result.push({
                    'name': book.title,
                    'downloaderName': 'shkola',
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
        }
    }
};

export { shkolaSearcher };