export const IPC_CHANNELS = {
  SELECT_FOLDER: 'folder:select',
  GET_FOLDERS: 'folder:getAll',

  START_SCAN: 'scan:start',
  SCAN_PROGRESS: 'scan:progress',
  SCAN_COMPLETE: 'scan:complete',

  GET_PHOTOS_BY_DATE: 'photos:getByDate',
  GET_EVENT_SUMMARY: 'photos:getEventSummary',
  TOGGLE_BEST: 'photos:toggleBest',
  GET_BEST_PHOTOS: 'photos:getBest',
  GET_BEST_PHOTOS_FOR_DATE: 'photos:getBestForDate',

  GET_THUMBNAIL_PATH: 'thumbnail:getPath',
  GET_PHOTO_FILE_URL: 'photo:getFileUrl'
} as const
