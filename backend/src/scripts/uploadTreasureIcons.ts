import fs from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'
import { getPublicAssetUrl, isRemoteAssetStorageEnabled, uploadAsset } from '../utils/assetStorage'
import { logger } from '../utils/logger'

// Load backend/.env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

async function main(): Promise<void> {
  if (!isRemoteAssetStorageEnabled()) {
    throw new Error(
      'Remote asset storage is not configured. Set ASSET_BUCKET, ASSET_ENDPOINT, ASSET_ACCESS_KEY_ID, ASSET_SECRET_ACCESS_KEY in backend/.env',
    )
  }

  const metals = ['bronze', 'silver', 'gold', 'diamond'] as const
  // When executed from backend/, resolve the frontend public path via ../frontend
  const baseDir = path.resolve(process.cwd(), '../frontend/public/static/icons/treasures')

  for (const m of metals) {
    const localPath = path.join(baseDir, `${m}.svg`)
    const buf = await fs.readFile(localPath)
    const key = `static/icons/treasures/${m}.svg`
    const res = await uploadAsset({
      key,
      body: buf,
      contentType: 'image/svg+xml',
      cacheControl: 'public, max-age=31536000, immutable',
    })
    const publicUrl = getPublicAssetUrl(key)
    logger.info('Uploaded treasure icon', {
      metal: m,
      storage: res.storage,
      key: res.key,
      url: publicUrl,
    })
    // eslint-disable-next-line no-console
    console.log(`✔ ${m}: ${publicUrl}`)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to upload treasure icons:', err)
  process.exit(1)
})
