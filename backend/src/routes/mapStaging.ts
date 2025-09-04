import type { Request, Response, NextFunction } from 'express'
import { Router } from 'express'
import multer from 'multer'
import { authenticateToken } from '../middleware/auth'
import { requireAdmin } from '../middleware/adminAuth'
import { mapStagingService } from '../services/mapStagingService'
import { logger } from '../utils/logger'

const router = Router()

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'))
    }
  }
})

// Check user's quota
router.get(
  '/quota',
  authenticateToken as any,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId || req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const quotaSummary = await mapStagingService.getUserQuotaSummary(userId)
      res.json(quotaSummary)
    } catch (error) {
      logger.error('Error checking quota:', error)
      res.status(500).json({ error: 'Failed to check quota' })
    }
  },
)

// Upload an image to staging
router.post(
  '/upload',
  authenticateToken as any,
  upload.single('image') as any,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId || req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      if (!req.file) {
        res.status(400).json({ error: 'No image file provided' })
        return
      }

      const stagingImage = await mapStagingService.uploadImage(userId, req.file)
      res.json({
        success: true,
        image: stagingImage,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image'
      logger.error('Error uploading image:', error)
      res.status(400).json({ error: errorMessage })
    }
  },
)

// Get user's staging images
router.get(
  '/my-images',
  authenticateToken as any,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId || req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const images = await mapStagingService.getUserStagingImages(userId)
      res.json(images)
    } catch (error) {
      logger.error('Error fetching staging images:', error)
      res.status(500).json({ error: 'Failed to fetch images' })
    }
  },
)

// Delete a staging image
router.delete(
  '/images/:imageId',
  authenticateToken as any,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId || req.user?.id
      const { imageId } = req.params

      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      // Check if user is admin
      const isAdmin = req.user?.isAdmin || false
      await mapStagingService.deleteStagingImage(userId, imageId, isAdmin)
      res.json({ success: true })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete image'
      logger.error('Error deleting image:', error)
      res.status(400).json({ error: errorMessage })
    }
  },
)

// Admin: Get all staging images
router.get(
  '/admin/all-images',
  authenticateToken as any,
  requireAdmin as any,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const images = await mapStagingService.getAllStagingImages()
      res.json(images)
    } catch (error) {
      logger.error('Error fetching all staging images:', error)
      res.status(500).json({ error: 'Failed to fetch images' })
    }
  },
)

// Admin: Delete any staging image
router.delete(
  '/admin/images/:imageId',
  authenticateToken as any,
  requireAdmin as any,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { imageId } = req.params
      const adminId = req.userId || req.user?.id

      if (!adminId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      await mapStagingService.deleteStagingImage(adminId, imageId, true)
      res.json({ success: true })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete image'
      logger.error('Error deleting image (admin):', error)
      res.status(400).json({ error: errorMessage })
    }
  },
)

export default router