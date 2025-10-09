export type KnownError = Error & {
    code?: string | number;
    errno?: number;
    syscall?: string;
    hostname?: string;
    status?: number;
    statusCode?: number;
    [key: string]: unknown;
};
export declare const toKnownError: (value: unknown) => KnownError;
export declare const getErrorMessage: (value: unknown) => string;
export declare const getErrorStack: (value: unknown) => string | undefined;
export declare const getErrorCode: (value: unknown) => string | number | undefined;
//# sourceMappingURL=errorHelpers.d.ts.map