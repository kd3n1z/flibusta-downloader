export interface ISearcher {
    name: string,
    prefix: string,
    priority: number,
    search: (query: string, limit: number, bannedBooks: string[], timeout: number) => Promise<Book[] | null>, // null is error
    getDownloadData: (bookId: string) => IDownloadData
    info: () => ISearcherInfo,
    [x: string]: unknown
}

export interface ISearcherInfo {
    href: string,
    name: string,
}

export interface IDownloadData {
    url: string,
    name: string,
    error: boolean
}

export interface Book {
    name: string,
    bookId: string,
}

export interface User {
    id: number,
    searchers: string[]
}