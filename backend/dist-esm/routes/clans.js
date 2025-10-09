"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_js_1 = require("../middleware/auth.js");
const clanMembershipService_js_1 = require("../services/clanMembershipService.js");
const clanService_js_1 = require("../services/clanService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
const validateRequest = (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(422).json({ errors: errors.array() });
        return true;
    }
    return false;
};
const handleKnownError = (error, res) => {
    if (error instanceof clanService_js_1.ClanServiceError) {
        const status = error.code === 'ALREADY_IN_CLAN' ? 409 : 400;
        res.status(status).json({ message: error.message, code: error.code });
        return true;
    }
    if (error instanceof clanMembershipService_js_1.ClanMembershipServiceError) {
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
    (0, express_validator_1.query)('search').optional().isString().isLength({ max: 64 }),
    (0, express_validator_1.query)('region').optional().isString().isLength({ max: 32 }),
    (0, express_validator_1.query)('recruitmentStatus').optional().isIn(['active', 'closed']),
    (0, express_validator_1.query)('privacy').optional().isIn(['public', 'hidden']),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }),
    (0, express_validator_1.query)('cursor').optional().isString().isLength({ max: 128 }),
], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const filters = {
            search: req.query.search?.trim() || undefined,
            region: req.query.region?.trim() || undefined,
            recruitmentStatus: req.query.recruitmentStatus,
            privacy: req.query.privacy,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
            cursor: req.query.cursor,
        };
        const result = await clanService_js_1.clanService.listClans(filters);
        res.json(result);
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to list clans');
    }
});
router.post('/', auth_js_1.authenticateToken, [
    (0, express_validator_1.body)('name').isString().isLength({ min: 3, max: 64 }),
    (0, express_validator_1.body)('tag').isString().isLength({ min: 2, max: 5 }),
    (0, express_validator_1.body)('motto').optional().isString().isLength({ max: 120 }),
    (0, express_validator_1.body)('description').optional().isString().isLength({ max: 1024 }),
    (0, express_validator_1.body)('crestAssetUrl').optional().isString().isURL(),
    (0, express_validator_1.body)('bannerAssetUrl').optional().isString().isURL(),
    (0, express_validator_1.body)('recruitmentPolicy').optional().isIn(['open', 'application', 'invite']),
    (0, express_validator_1.body)('recruitmentStatus').optional().isIn(['active', 'closed']),
    (0, express_validator_1.body)('privacy').optional().isIn(['public', 'hidden']),
    (0, express_validator_1.body)('minimumRank').optional().isInt({ min: 0 }),
    (0, express_validator_1.body)('autoAcceptThresholds').optional().isObject(),
    (0, express_validator_1.body)('language').optional().isString().isLength({ max: 16 }),
    (0, express_validator_1.body)('region').optional().isString().isLength({ max: 32 }),
    (0, express_validator_1.body)('timeZone').optional().isString().isLength({ max: 64 }),
], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const clanRequest = {
            name: req.body.name,
            tag: req.body.tag,
            motto: req.body.motto,
            description: req.body.description,
            crestAssetUrl: req.body.crestAssetUrl,
            bannerAssetUrl: req.body.bannerAssetUrl,
            recruitmentPolicy: req.body.recruitmentPolicy,
            recruitmentStatus: req.body.recruitmentStatus,
            minimumRank: req.body.minimumRank,
            autoAcceptThresholds: req.body.autoAcceptThresholds,
            language: req.body.language,
            region: req.body.region,
            timeZone: req.body.timeZone,
            privacy: req.body.privacy,
        };
        const clan = await clanService_js_1.clanService.createClan(req.userId, clanRequest);
        res.status(201).json({ clan });
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create clan');
    }
});
router.get('/:slug', [(0, express_validator_1.param)('slug').isString().isLength({ min: 3, max: 120 })], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const clan = await clanService_js_1.clanService.getClanBySlug(req.params.slug);
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
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to load clan detail', 500, { slug: req.params.slug });
    }
});
router.post('/:slug/applications', auth_js_1.authenticateToken, [(0, express_validator_1.param)('slug').isString(), (0, express_validator_1.body)('message').optional().isString().isLength({ max: 500 })], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        const clan = await clanService_js_1.clanService.getClanBySlug(req.params.slug);
        if (!clan) {
            res.status(404).json({ message: 'Clan not found' });
            return;
        }
        const application = await clanMembershipService_js_1.clanMembershipService.applyToClan(req.userId, clan.id, req.body.message);
        res.status(201).json({ application });
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to submit clan application', 500, {
            slug: req.params.slug,
            userId: req.userId,
        });
    }
});
router.patch('/:slug/applications/:applicationId', auth_js_1.authenticateToken, [
    (0, express_validator_1.param)('slug').isString(),
    (0, express_validator_1.param)('applicationId').isUUID(),
    (0, express_validator_1.body)('decision').isIn(['accepted', 'rejected']),
], async (req, res) => {
    if (validateRequest(req, res))
        return;
    try {
        if (!(await ensureFeatureEnabled(req, res))) {
            return;
        }
        const clan = await clanService_js_1.clanService.getClanBySlug(req.params.slug);
        if (!clan) {
            res.status(404).json({ message: 'Clan not found' });
            return;
        }
        const application = await clanMembershipService_js_1.clanMembershipService.reviewApplication(req.userId, clan.id, req.params.applicationId, req.body.decision === 'accepted' ? 'accepted' : 'rejected');
        res.json({ application });
    }
    catch (error) {
        if (handleKnownError(error, res)) {
            return;
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to review clan application', 500, {
            slug: req.params.slug,
            applicationId: req.params.applicationId,
            userId: req.userId,
        });
    }
});
exports.default = router;
//# sourceMappingURL=clans.js.map