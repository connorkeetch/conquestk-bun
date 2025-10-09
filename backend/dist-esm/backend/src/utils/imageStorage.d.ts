interface StoreImageOptions {
    mimeType?: string;
    preferredFilename?: string;
    subdirectory?: string;
}
export interface StoredImageInfo {
    filename: string;
    relativeUrl: string;
    width: number;
    height: number;
    storageKey: string;
}
export declare const storeBase64Image: (base64Data: string, options?: StoreImageOptions) => Promise<StoredImageInfo>;
export declare const storeImageBuffer: (buffer: Buffer, options?: StoreImageOptions) => Promise<StoredImageInfo>;
export {};
//# sourceMappingURL=imageStorage.d.ts.map