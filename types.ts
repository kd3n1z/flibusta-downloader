export interface ISearcher {
    name: string,
    prefix: string,
    priority: number,
    search: (query: string, limit: number, bannedBooks: string[], timeout: number) => Promise<IBook[] | null>,
    getDownloadData: (bookId: string, timeout: number) => Promise<IDownloadData | null>,
    info: () => ISearcherInfo,
    [x: string]: unknown
}

export interface ISearcherInfo {
    href: string,
    name: string
}

export interface IDownloadData {
    url: string,
    name: string,
    fileExtension: string
}

export interface IBook {
    name: string,
    bookId: string
}

export interface IUser {
    id: number,
    searchers: string[],
    totalBooksDownloaded: number
}

export interface ILanguage {
    displayName: string
}