"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.termsService = exports.TermsService = void 0;
const database_js_1 = require("../config/database.js");
const logger_js_1 = require("../utils/logger.js");
class TermsService {
    async hasAcceptedTerms(userId, featureType) {
        try {
            const currentVersion = this.getCurrentVersion(featureType);
            const result = await (0, database_js_1.query)(`SELECT * FROM user_terms_acceptance 
         WHERE user_id = $1 AND feature_type = $2 AND terms_version = $3`, [userId, featureType, currentVersion]);
            return result.rows.length > 0;
        }
        catch (error) {
            logger_js_1.logger.error('Error checking terms acceptance:', error);
            return false;
        }
    }
    async acceptTerms(userId, featureType, ipAddress, userAgent) {
        try {
            const currentVersion = this.getCurrentVersion(featureType);
            const result = await (0, database_js_1.query)(`INSERT INTO user_terms_acceptance 
         (user_id, feature_type, terms_version, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, feature_type, terms_version) 
         DO UPDATE SET accepted_at = CURRENT_TIMESTAMP
         RETURNING *`, [userId, featureType, currentVersion, ipAddress, userAgent]);
            return result.rows[0];
        }
        catch (error) {
            logger_js_1.logger.error('Error accepting terms:', error);
            throw error;
        }
    }
    async getUserTermsHistory(userId) {
        try {
            const result = await (0, database_js_1.query)(`SELECT * FROM user_terms_acceptance 
         WHERE user_id = $1
         ORDER BY accepted_at DESC`, [userId]);
            return result.rows;
        }
        catch (error) {
            logger_js_1.logger.error('Error fetching terms history:', error);
            throw error;
        }
    }
    getCurrentVersion(featureType) {
        const validFeatureType = featureType;
        return TermsService.CURRENT_VERSIONS[validFeatureType] || '1.0';
    }
    getTermsContent(featureType) {
        const terms = {
            map_editor: {
                title: 'Map Editor Terms & Conditions',
                version: '1.0',
                sections: [
                    {
                        title: 'Content Guidelines',
                        items: [
                            'You will not upload copyrighted material without permission',
                            'You will not create maps containing offensive or inappropriate content',
                            'You will not upload images that you do not have the right to use',
                            'You will ensure your maps are suitable for all ages',
                        ],
                    },
                    {
                        title: 'Intellectual Property',
                        items: [
                            'By uploading a map, you grant ConquestK a license to use, modify, and distribute it',
                            'You retain ownership of your original creative work',
                            'ConquestK may feature your maps without additional compensation',
                            'You may request removal of your maps at any time',
                        ],
                    },
                    {
                        title: 'Quality Standards',
                        items: [
                            'Maps must be playable and balanced',
                            'Territory boundaries must be clear and unambiguous',
                            'Maps must have proper adjacency connections',
                            'Sector bonuses must be reasonable',
                        ],
                    },
                    {
                        title: 'Moderation',
                        items: [
                            'All maps are subject to review before publication',
                            'ConquestK reserves the right to reject or remove maps',
                            'Repeated violations may result in loss of map editor privileges',
                            'Decisions by moderators are final',
                        ],
                    },
                ],
            },
            general: {
                title: 'Terms of Service',
                version: '1.0',
                sections: [
                    {
                        title: 'General Terms',
                        items: [
                            'You must be 13 years or older to use this service',
                            'You are responsible for your account security',
                            'You will not abuse or exploit the game systems',
                            'You will treat other players with respect',
                        ],
                    },
                ],
            },
        };
        return terms[featureType] || terms.general;
    }
}
exports.TermsService = TermsService;
TermsService.CURRENT_VERSIONS = {
    map_editor: '1.0',
    tournament: '1.0',
    general: '1.0',
};
exports.termsService = new TermsService();
//# sourceMappingURL=termsService.js.map