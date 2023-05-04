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
    totalBooksDownloaded: number,
    language: string
}

export interface ILanguage {
    displayName: string,
    start: string,
    aboutButton: string,
    errorCommandNotFound: string,
    errorQueryTooLong: string,
    searching: string,
    notFound: string,
    bookMenu: string,
    errorAlreadyDownloading: string,
    downloaded: string,
    downloading: string,
    errorDownloadFailed: string,
    errorNotAvailable: string,
    errorNotAvailableAnymore: string
}