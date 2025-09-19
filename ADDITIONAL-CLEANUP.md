# Additional Cleanup Opportunities

## 🟢 Quick Wins (Safe)

### 1. Move test-map-upload.js
- **Status**: ✅ Already moved to `tests/manual/`
- **Reason**: Test file belonged in tests directory

### 2. Backend log files
- **Location**: `backend/logs/error.log`, `backend/logs/combined.log`
- **Action**: Add `backend/logs/*.log` to .gitignore (already covered by `*.log`)
- **Note**: These are runtime logs, shouldn't be in version control

## 🟡 Consider for Later

### 1. Archived Migrations (136KB)
- **Location**: `backend/migrations/archived/`
- **Contains**: 13 old migration files from before consolidation
- **Recommendation**: Keep for now as reference, but can delete after confirming production is stable
- **Note**: Already consolidated into migration 011

### 2. Backend Scripts
- **Location**: `backend/scripts/`
- **Files**: 
  - `backup-production.js` - Might still be useful for manual backups
  - `deploy-consolidated-migration.js` - Check if still needed with Railway
  - `deploy-consolidated-nodejs.js` - Check if still needed with Railway
- **Recommendation**: Review with team before removing

## 📝 Code Quality Issues Found

### TODO Comments (20 found)
Notable areas needing attention:
- **Game Logic**: Continent bonuses not implemented (`gameActions.ts:315`)
- **Database**: Game completion not saved (`gameService.ts:379-389`)
- **ELO System**: Rating updates not implemented (`gameService.ts:384`)
- **Chat**: Missing conversation notifications (`chatHandlers.ts:165,197`)
- **Battle System**: Battle results not fully integrated (`battleWorker.ts:187`)

### Console.log Statements (79 found)
- Most are in development/debug code
- Consider using proper logging library (Winston is already set up)
- Files with most console.logs:
  - `audioService.ts` - 7 occurrences
  - `App.tsx` - 4 occurrences  
  - `main.tsx` - 6 occurrences

## 🔍 Other Observations

### Duplicate Functionality
- Multiple backup scripts that might overlap
- Console.log vs Winston logger usage inconsistent

### File Organization
- ✅ Audio files now properly organized
- ✅ Test files moved to appropriate locations
- Consider organizing backend scripts into subdirectories (migrations/, deployments/, utilities/)

## 📊 Cleanup Impact Summary

### Completed Today
- **Deleted**: 4MB of unnecessary files (screenshots, mhtml, test files)
- **Reorganized**: 153MB of audio files to proper location
- **Deduplicated**: 19 redundant audio files
- **Moved**: Test files to appropriate directories

### Potential Future Savings
- **Archived migrations**: 136KB (after confirming stable)
- **Backend scripts**: ~15KB (if obsolete ones removed)
- **Log files**: Variable (should be gitignored)

## 🎯 Recommended Priority

1. **High Priority**: 
   - Fix TODO items related to game completion and ELO
   - Add proper logging instead of console.log

2. **Medium Priority**:
   - Review and clean backend scripts
   - Standardize logging approach

3. **Low Priority**:
   - Remove archived migrations (after stability confirmed)
   - Optimize console.log usage in development code

## 🚀 Next Steps

1. Review TODO comments and create GitHub issues for tracking
2. Set up proper log rotation for backend logs
3. Audit backend scripts with team to identify obsolete ones
4. Consider implementing the missing game features (continent bonuses, ELO, etc.)