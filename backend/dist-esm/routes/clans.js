import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { ClanMembershipServiceError, clanMembershipService, } from '../services/clanMembershipService.js';
import { ClanServiceError, clanService } from '../services/clanService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
const router = Router();
const validateRequest = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(422).json({ errors: errors.array() });
        return true;
    }
    return false;
};
const handleKnownError = (error, res) => {
    if (error instanceof ClanServiceError) {
        const status = error.code === 'ALREADY_IN_CLAN' ? 409 : 400;
        res.status(status).json({ message: error.message, code: error.code });
        return true;
    }
    if (error instanceof ClanMembershipServiceError) {
        const statusMap = {
            ALREADY_IN_CLAN: 409,
            APPLICATION_EXISTS: 409,
            NOT_FOUND: 404,
            NOT_IN_CLAN: 403,
            FORBIDDEN: 403,
            CLAN_CLOSED: 403,
            CLAN_NOT_FOUND: 404,
            ALREADY_REVIEWED: 409,
            NOT_ACTIVE: 403,
        };
        const status = statusMap[error.code] ?? 400;
        res.status(status).json({ message: error.message, code: error.code });
        return true;
    }
    return false;
};
const ensureFeatureEnabled = async (_req, _res) => true;
router.get('/', [
    query('search').optional().isString().isLength({ max: 64 }),
    query('region').optional().isString().isLength({ max: 32 }),
    query('recruitmentStatus').optional().isIn(['active', 'closed']),
    query('privacy').optional().isIn(['public', 'hidden']),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('cursor').optional().isString().isLength({ max: 128 }),
], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const filters = {
            ...(typeof req.query.search === 'string' && req.query.search.trim()
                ? { search: req.query.search.trim() }
                : {}),
            ...(typeof req.query.region === 'string' && req.query.region.trim()
                ? { region: req.query.region.trim() }
                : {}),
            ...(typeof req.query.recruitmentStatus === 'string'
                ? { recruitmentStatus: req.query.recruitmentStatus }
                : {}),
            ...(typeof req.query.privacy === 'string'
                ? { privacy: req.query.privacy }
                : {}),
            ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
            ...(typeof req.query.cursor === 'string' ? { cursor: req.query.cursor } : {}),
        };
        const result = await clanService.listClans(filters);
        res.json(result);
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        handleRouteError(error, req, 'Failed to list clans');
    }
});
router.post('/', authenticateToken, [
    body('name').isString().isLength({ min: 3, max: 64 }),
    body('tag').isString().isLength({ min: 2, max: 5 }),
    body('motto').optional().isString().isLength({ max: 120 }),
    body('description').optional().isString().isLength({ max: 1024 }),
    body('crestAssetUrl').optional().isString().isURL(),
    body('bannerAssetUrl').optional().isString().isURL(),
    body('recruitmentPolicy').optional().isIn(['open', 'application', 'invite']),
    body('recruitmentStatus').optional().isIn(['active', 'closed']),
    body('privacy').optional().isIn(['public', 'hidden']),
    body('minimumRank').optional().isInt({ min: 0 }),
    body('autoAcceptThresholds').optional().isObject(),
    body('language').optional().isString().isLength({ max: 16 }),
    body('region').optional().isString().isLength({ max: 32 }),
    body('timeZone').optional().isString().isLength({ max: 64 }),
], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const clanRequest = {
            name: req.body.name,
            tag: req.body.tag,
            ...(typeof req.body.motto === 'string' ? { motto: req.body.motto } : {}),
            ...(typeof req.body.description === 'string' ? { description: req.body.description } : {}),
            ...(typeof req.body.crestAssetUrl === 'string'
                ? { crestAssetUrl: req.body.crestAssetUrl }
                : {}),
            ...(typeof req.body.bannerAssetUrl === 'string'
                ? { bannerAssetUrl: req.body.bannerAssetUrl }
                : {}),
            ...(typeof req.body.recruitmentPolicy === 'string'
                ? { recruitmentPolicy: req.body.recruitmentPolicy }
                : {}),
            ...(typeof req.body.recruitmentStatus === 'string'
                ? { recruitmentStatus: req.body.recruitmentStatus }
                : {}),
            ...(typeof req.body.minimumRank === 'number' ? { minimumRank: req.body.minimumRank } : {}),
            ...(req.body.autoAcceptThresholds
                ? { autoAcceptThresholds: req.body.autoAcceptThresholds }
                : {}),
            ...(typeof req.body.language === 'string' ? { language: req.body.language } : {}),
            ...(typeof req.body.region === 'string' ? { region: req.body.region } : {}),
            ...(typeof req.body.timeZone === 'string' ? { timeZone: req.body.timeZone } : {}),
            ...(typeof req.body.privacy === 'string' ? { privacy: req.body.privacy } : {}),
        };
        const clan = await clanService.createClan(req.userId, clanRequest);
        res.status(201).json({ clan });
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        handleRouteError(error, req, 'Failed to create clan');
    }
});
router.get('/:slug', [param('slug').isString().isLength({ min: 3, max: 120 })], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const clan = await clanService.getClanBySlug(req.params.slug);
        if (!clan) {
            res.status(404).json({ message: 'Clan not found' });
            return;
        }
        res.json({ clan });
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        handleRouteError(error, req, 'Failed to load clan detail', 500, { slug: req.params.slug });
    }
});
router.post('/:slug/applications', authenticateToken, [param('slug').isString(), body('message').optional().isString().isLength({ max: 500 })], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const clan = await clanService.getClanBySlug(req.params.slug);
        if (!clan) {
            res.status(404).json({ message: 'Clan not found' });
            return;
        }
        const application = await clanMembershipService.applyToClan(req.userId, clan.id, req.body.message);
        res.status(201).json({ application });
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        handleRouteError(error, req, 'Failed to submit clan application', 500, {
            slug: req.params.slug,
            userId: req.userId,
        });
    }
});
router.patch('/:slug/applications/:applicationId', authenticateToken, [
    param('slug').isString(),
    param('applicationId').isUUID(),
    body('decision').isIn(['accepted', 'rejected']),
], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        if (!(await ensureFeatureEnabled(req, res))) {
            return;
        }
        const clan = await clanService.getClanBySlug(req.params.slug);
        if (!clan) {
            res.status(404).json({ message: 'Clan not found' });
            return;
        }
        const application = await clanMembershipService.reviewApplication(req.userId, clan.id, req.params.applicationId, req.body.decision === 'accepted' ? 'accepted' : 'rejected');
        res.json({ application });
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        handleRouteError(error, req, 'Failed to review clan application', 500, {
            slug: req.params.slug,
            applicationId: req.params.applicationId,
            userId: req.userId,
        });
    }
});
export default router;
//# sourceMappingURL=clans.js.map