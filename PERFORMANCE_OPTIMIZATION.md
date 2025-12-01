# Performance Optimization - Logging

## Problem
The game had ~416 console.log statements throughout the codebase, causing significant performance lag (several seconds delay) during gameplay, especially during battles and drafts.

## Solution
Implemented conditional debug logging:
- Added `DEBUG` flag and `debugLog()` function to gameManager.js and utils.js
- Converted 225+ debug console.log statements to use `debugLog()` instead
- Debug logs are now disabled by default in production
- Important error messages and user-facing logs remain as console.log

## Performance Impact
- **Before**: 416 console.log statements running on every action
- **After**: ~170 essential logs only, 225+ debug logs disabled by default
- **Expected improvement**: 50-70% reduction in I/O overhead, significantly faster response times

## Enabling Debug Mode
To enable detailed debug logging for development/troubleshooting:

### Windows (PowerShell):
```powershell
$env:DEBUG_GAME="true"; cd backend; npm start
```

### Linux/Mac:
```bash
DEBUG_GAME=true npm start
```

### Permanently (in .env file):
```
DEBUG_GAME=true
```

## Files Modified
- `backend/gameManager.js`: Added DEBUG flag and debugLog function, converted 217 logs
- `backend/utils.js`: Added DEBUG flag and debugLog function, converted 8 logs
