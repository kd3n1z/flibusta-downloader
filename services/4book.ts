import axios from 'axios';
import jsdom from 'jsdom';
import { IBook, IDownloadData, ISearcher, ISearcherInfo } from "../types";
import { reserveUrl, getReservedUrl } from '../index';

const fourBookSearcher: ISearcher = {
    'mirror': 'https://4book.org',
    'section': 'textbook',

    'name': '4book',
    'prefix': '📒',
    'priority': 300,
    'search': async function (query: string, limit: number, bannedBooks: string[], timeout: number): Promise<IBook[] | null> {
        try {
            const resp = await axios.get(this.mirror + '/search?search=' + encodeURI(query) + "&section=" + this.section, { timeout: timeout });

            const links: NodeListOf<Element> = new jsdom.JSDOM(resp.data).window.document.querySelectorAll(".item-catalog>a");

            const result: IBook[] = [];

            for (const link of links) {
                if (limit == 0) {
                    break;
                }

                const href = (link as HTMLElement).getAttribute('href');

                if (href) {
                    const id: string = href;
                    if (!bannedBooks.includes(id)) {
                        result.push({
                            'name': (link.querySelector(".title") as HTMLElement).textContent as string,
                            'bookId': await reserveUrl(id)
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
            const reservedUrl = await getReservedUrl(bookId);

            if (reservedUrl == null) {
                return null;
            }

            const resp = await axios.get((this.mirror as string) + reservedUrl, { timeout: timeout });

            const document: Document = new jsdom.JSDOM(resp.data).window.document;
            const title: string = document.querySelectorAll("h1")[0].textContent as string;

            let url: string | null = null;

            for (const button of document.querySelectorAll(".des-book")[0].children) {
                const href = button.getAttribute("href");
                if (href && href.endsWith(".pdf")) {
                    url = href;
                    break;
                }
            }

            if (url != null) {
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

export { fourBookSearcher };