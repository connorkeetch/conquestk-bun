const isErrorObject = (value) => {
    return typeof value === 'object' && value !== null;
};
export const toKnownError = (value) => {
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
export const getErrorMessage = (value) => {
    return toKnownError(value).message;
};
export const getErrorStack = (value) => {
    return toKnownError(value).stack;
};
export const getErrorCode = (value) => {
    return toKnownError(value).code;
};
//# sourceMappingURL=errorHelpers.js.map