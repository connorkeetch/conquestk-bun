"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorCode = exports.getErrorStack = exports.getErrorMessage = exports.toKnownError = void 0;
const isErrorObject = (value) => {
    return typeof value === 'object' && value !== null;
};
const toKnownError = (value) => {
    if (value instanceof Error) {
        return value;
    }
    if (isErrorObject(value)) {
        const tentativeMessage = value.message;
        const normalized = new Error(typeof tentativeMessage === 'string' ? tentativeMessage : String(value));
        Object.assign(normalized, value);
        return normalized;
    }
    return new Error(String(value));
};
exports.toKnownError = toKnownError;
const getErrorMessage = (value) => {
    return (0, exports.toKnownError)(value).message;
};
exports.getErrorMessage = getErrorMessage;
const getErrorStack = (value) => {
    return (0, exports.toKnownError)(value).stack;
};
exports.getErrorStack = getErrorStack;
const getErrorCode = (value) => {
    return (0, exports.toKnownError)(value).code;
};
exports.getErrorCode = getErrorCode;
//# sourceMappingURL=errorHelpers.js.map