# ConquestK Codebase Cleanup Plan

## Overview
After thorough analysis of the codebase, here are the recommended cleanup actions organized by safety level.

## 🟢 SAFE TO DELETE (Low Risk)

### 1. Root Directory Files
- **Screenshot 2025-09-10 094449.png** (3.8MB)
  - Reason: Screenshot file that shouldn't be in version control
  - Action: `rm "Screenshot 2025-09-10 094449.png"`

- **maps.mhtml** (154KB)  
  - Reason: Saved webpage, not referenced anywhere in code
  - Action: `rm maps.mhtml`

- **test-audio.html**
  - Reason: Test file not referenced in any code or scripts
  - Action: `rm test-audio.html`

### 2. Empty/Unused Directories
- **logs/**
  - Reason: Empty directory with no files
  - Action: `rm -rf logs/`

- **tests-examples/**
  - Reason: Contains only demo-todo-app.spec.ts which is a Playwright example, not related to the project
  - Action: `rm -rf tests-examples/`

### 3. Archived Migration Files
- **backend/migrations/archived/**
  - Reason: Old migrations that have been consolidated into migration 011
  - Action: Already archived, can be deleted if you have backups
  - `rm -rf backend/migrations/archived/`

## 🟡 REQUIRES MIGRATION (Medium Risk)

### 1. Audio Files Location
- **"Audio Files/" directory in root** (159MB total)
  - Issue: Should be in `frontend/public/audio-files/` (note: lowercase, no space)
  - Current: Referenced in code as `/audio files/`
  - Action Steps:
    ```bash
    # 1. Create proper directory
    mkdir -p frontend/public/audio-files
    
    # 2. Move files (rename directory)
    mv "Audio Files"/* frontend/public/audio-files/
    
    # 3. Update audioService.ts references from '/audio files/' to '/audio-files/'
    # 4. Remove old directory
    rmdir "Audio Files"
    ```

### 2. Test File Organization  
- **test-map-upload.js** in root
  - Issue: Should be in tests/ directory if still needed
  - Action: Move to `tests/manual/test-map-upload.js` or delete if covered by other tests

## 🟠 REVIEW BEFORE DELETION (Higher Risk)

### 1. Backend Scripts
- **backend/scripts/backup-production.js**
- **backend/scripts/deploy-consolidated-migration.js**  
- **backend/scripts/deploy-consolidated-nodejs.js**
  - Status: Referenced in package.json but may be obsolete with Railway deployment
  - Review: Check if these are still needed for any manual operations
  - If not needed: Remove scripts AND their package.json references

## 🔴 DO NOT DELETE (Critical)

### 1. Configuration Files
- All `.json`, `.toml`, `.yml` config files
- `.nvmrc` - Node version specification
- `biome.json` - Linter configuration  
- `railway.json` - Deployment configuration

### 2. Documentation
- All `.md` files in root and docs/
- CLAUDE.md and AGENTS.md are AI assistant instructions

### 3. Scripts Directory
- **scripts/** folder contains setup and utility scripts still in use

## Duplicate Audio Files Analysis

Found multiple versions of the same sounds in Audio Files/:
- 7 dice roll variations (could reduce to 3-4)
- 13 turn notification variations (could reduce to 5-6)  
- 4 trumpet fanfare variations (could reduce to 2)
- 3 Conquer the World files in different formats (.mp3 and .wav)
  - Keep only the .mp3 version (3MB vs 44-66MB for .wav)

## Storage Savings Summary

- **Immediate savings**: ~4MB (Screenshot + mhtml + test files)
- **Audio reorganization**: Moved 150MB+ to proper location, kept all WAV versions
- **File count reduction**: ~25 duplicate MP3 files removed
- **Final audio size**: 153MB (4MB MP3s + 149MB WAVs - all 3 versions kept)

## Recommended Execution Order

1. **First Pass (Safe)**
   ```bash
   rm "Screenshot 2025-09-10 094449.png"
   rm maps.mhtml
   rm test-audio.html
   rm -rf logs/
   rm -rf tests-examples/
   ```

2. **Second Pass (Audio Migration)**
   - Create frontend/public/audio-files/
   - Move and rename audio files
   - Update audioService.ts
   - Remove duplicate WAV files (keep MP3 only)

3. **Third Pass (After Review)**
   - Clean up backend/scripts/ if confirmed unused
   - Remove archived migrations if backups exist

## Version Control Notes

After cleanup, ensure:
1. Add removed files to .gitignore if they might be regenerated
2. Commit cleanup in logical groups
3. Tag the commit before major deletions for easy rollback

## Additional Recommendations

1. **Add to .gitignore:**
   ```
   *.mhtml
   *.png
   *.jpg
   *.jpeg
   /logs/
   ```

2. **Consider using Git LFS** for any remaining audio files to reduce repository size

3. **Set up pre-commit hooks** to prevent large files from being committed