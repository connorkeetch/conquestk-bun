export interface TermsAcceptance {
    id: string;
    userId: string;
    featureType: string;
    termsVersion: string;
    acceptedAt: Date;
    ipAddress?: string;
    userAgent?: string;
}
export declare class TermsService {
    private static readonly CURRENT_VERSIONS;
    hasAcceptedTerms(userId: string, featureType: string): Promise<boolean>;
    acceptTerms(userId: string, featureType: string, ipAddress?: string, userAgent?: string): Promise<TermsAcceptance>;
    getUserTermsHistory(userId: string): Promise<TermsAcceptance[]>;
    getCurrentVersion(featureType: string): string;
    getTermsContent(featureType: string): {
        title: string;
        version: string;
        sections: Array<{
            title: string;
            items: string[];
        }>;
    };
}
export declare const termsService: TermsService;
//# sourceMappingURL=termsService.d.ts.map