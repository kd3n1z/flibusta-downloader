"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flibusta = void 0;
const axios_1 = __importDefault(require("axios"));
const jsdom_1 = __importDefault(require("jsdom"));
const flibusta = {
    'mirror': 'http://flibusta.is',
    'name': 'flibusta',
    'prefix': '📕',
    'priority': 1000,
    'search': function (query, limit, bannedBooks, timeout) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            console.log('1');
            const resp = yield axios_1.default.get(this.mirror + '/booksearch?ask=' + encodeURI(query), { timeout: timeout });
            console.log('2');
            console.log(resp.data);
            const links = new jsdom_1.default.JSDOM(resp.data).window.documebannedBooksnt.querySelectorAll("#main>ul>li>a");
            let result = [];
            try {
                for (const link of links) {
                    if (limit == 0) {
                        break;
                    }
                    if (link.getAttribute('href')) {
                        if (link.getAttribute('href').startsWith('/b/')) {
                            let id = (_a = link.getAttribute('href')) === null || _a === void 0 ? void 0 : _a.split('/')[2];
                            if (!bannedBooks.includes(id)) {
                                result.push({
                                    'name': link.parentElement.textContent,
                                    'downloaderName': 'flibusta',
                                    'bookId': id
                                });
                                limit--;
                            }
                        }
                    }
                }
            }
            catch (_b) { }
            return result;
        });
    },
    'info': function () {
        return {
            'href': this.mirror,
            'name': this.name
        };
    }
};
exports.flibusta = flibusta;
