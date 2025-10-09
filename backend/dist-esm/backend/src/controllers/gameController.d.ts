import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../types/express.js';
export declare class GameController {
    private gameRoomService;
    private lifecycleService;
    private gameService;
    getRooms: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    createRoom: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    submitAction: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    transferConquest: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    updateTeamAssignment: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    setReadyState: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    joinRoom: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    leaveRoom: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    closeRoom: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    updateAiOpponents: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    getRoomDetails: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
    getRoomState: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    getMyGames: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    getMyGamesMeta: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
    getRoomLog: (req: AuthenticatedRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=gameController.d.ts.map