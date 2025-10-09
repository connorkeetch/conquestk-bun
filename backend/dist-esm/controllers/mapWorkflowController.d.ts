import type { Response } from 'express';
import type { AuthenticatedRequest } from '../types/express.js';
export declare class MapWorkflowController {
    saveDraft(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getUserDrafts(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getDraft(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    publishDraft(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    submitForReview(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getPendingReviews(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    approveMap(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    rejectMap(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getAdminNotifications(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    markNotificationRead(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    archiveMap(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    toggleFeatured(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getMapsByStatus(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
    getMapHistory(req: AuthenticatedRequest, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=mapWorkflowController.d.ts.map