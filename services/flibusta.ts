import axios from "axios";
import jsdom from 'jsdom';
import { Book, ISearcher, ISearcherInfo } from "../types";

const flibusta: ISearcher = {
    'mirror': 'http://flibusta.is',

    'name': 'flibusta',
    'prefix': '📕',
    'priority': 1000,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<Book[]> {
        console.log('1');
        const resp = await axios.get((this.mirror as string) + '/booksearch?ask=' + encodeURI(query), {timeout: timeout});
        console.log('2');
        console.log(resp.data);

        const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.documebannedBooksnt.querySelectorAll("#main>ul>li>a");
        
        let result: Book[] = [];
        
        try {
            for(const link of links) {
                if(limit == 0) {
                    break;
                }
                
                if((link as HTMLElement).getAttribute('href')) {
                    if(((link as HTMLElement).getAttribute('href') as string).startsWith('/b/')) {
                        let id: string = link.getAttribute('href')?.split('/')[2] as string;
                        if(!bannedBooks.includes(id)) {
                            result.push({
                                'name': (link.parentElement as HTMLElement).textContent as string,
                                'downloaderName': 'flibusta',
                                'bookId': id
                            });
                            limit--;
                        }
                    }
                }
            }
        }catch{}

        return result;
    },
    'info': function (): ISearcherInfo {
        return {
            'href': this.mirror as string,
            'name': this.name
        }
    }
};

export { flibusta };