"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = void 0;
const notFound = (req, res, next) => {
    const shouldLog = !req.originalUrl.includes('favicon.ico') &&
        !req.originalUrl.includes('robots.txt') &&
        req.method !== 'OPTIONS';
    if (shouldLog) {
        console.warn(`404 - Not Found: ${req.method} ${req.originalUrl}`);
    }
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};
exports.notFound = notFound;
//# sourceMappingURL=notFound.middleware.js.map