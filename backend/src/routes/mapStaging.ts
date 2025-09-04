import { Router } from 'express'
import multer from 'multer'
import { authenticateToken } from '../middleware/auth'
import { requireAdmin } from '../middleware/admin'
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
router.get('/quota', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const quotaSummary = await mapStagingService.getUserQuotaSummary(userId)
    res.json(quotaSummary)
  } catch (error) {
    logger.error('Error checking quota:', error)
    res.status(500).json({ error: 'Failed to check quota' })
  }
})

// Upload an image to staging
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' })
    }

    const stagingImage = await mapStagingService.uploadImage(userId, req.file)
    res.json({
      success: true,
      image: stagingImage
    })
  } catch (error: any) {
    logger.error('Error uploading image:', error)
    res.status(400).json({ error: error.message || 'Failed to upload image' })
  }
})

// Get user's staging images
router.get('/my-images', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const images = await mapStagingService.getUserStagingImages(userId)
    res.json(images)
  } catch (error) {
    logger.error('Error fetching staging images:', error)
    res.status(500).json({ error: 'Failed to fetch images' })
  }
})

// Delete a staging image
router.delete('/images/:imageId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id
    const { imageId } = req.params
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    await mapStagingService.deleteStagingImage(userId, imageId, req.user?.isAdmin)
    res.json({ success: true })
  } catch (error: any) {
    logger.error('Error deleting image:', error)
    res.status(400).json({ error: error.message || 'Failed to delete image' })
  }
})

// Admin: Get all staging images
router.get('/admin/all-images', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const images = await mapStagingService.getAllStagingImages()
    res.json(images)
  } catch (error) {
    logger.error('Error fetching all staging images:', error)
    res.status(500).json({ error: 'Failed to fetch images' })
  }
})

// Admin: Delete any staging image
router.delete('/admin/images/:imageId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { imageId } = req.params
    const adminId = req.user?.id
    
    if (!adminId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    await mapStagingService.deleteStagingImage(adminId, imageId, true)
    res.json({ success: true })
  } catch (error: any) {
    logger.error('Error deleting image (admin):', error)
    res.status(400).json({ error: error.message || 'Failed to delete image' })
  }
})

export default router