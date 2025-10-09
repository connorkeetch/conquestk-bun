export interface UploadAssetOptions {
    key: string;
    body: Buffer | Uint8Array;
    contentType?: string;
    cacheControl?: string;
}
export interface AssetUploadResult {
    key: string;
    url: string;
    storage: 'remote' | 'local';
}
export declare const isRemoteAssetStorageEnabled: () => boolean;
export declare const getPublicAssetUrl: (key: string) => string;
export declare const uploadAsset: (options: UploadAssetOptions) => Promise<AssetUploadResult>;
export declare const extractStorageKeyFromUrl: (input: string | null | undefined) => string | null;
export declare const deleteAsset: (key: string) => Promise<void>;
export declare const assetExists: (key: string) => Promise<boolean>;
//# sourceMappingURL=assetStorage.d.ts.map