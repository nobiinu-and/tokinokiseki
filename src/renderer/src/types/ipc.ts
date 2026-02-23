export const IPC_CHANNELS = {
  SELECT_FOLDER: 'folder:select',
  GET_FOLDERS: 'folder:getAll',

  START_SCAN: 'scan:start',
  SCAN_PROGRESS: 'scan:progress',
  SCAN_COMPLETE: 'scan:complete',

  GET_PHOTOS_BY_DATE: 'photos:getByDate',
  GET_DATE_SUMMARY: 'photos:getDateSummary',
  TOGGLE_BEST: 'photos:toggleBest',
  GET_BEST_PHOTOS: 'photos:getBest',
  GET_BEST_PHOTOS_FOR_DATE: 'photos:getBestForDate',

  GET_THUMBNAIL_PATH: 'thumbnail:getPath',
  GET_PHOTO_FILE_URL: 'photo:getFileUrl',

  START_AUTO_TAG: 'tags:startAutoTag',
  CANCEL_AUTO_TAG: 'tags:cancel',
  AUTO_TAG_PROGRESS: 'tags:progress',
  AUTO_TAG_COMPLETE: 'tags:complete',
  GET_TAGS_FOR_PHOTO: 'tags:getForPhoto',
  GET_TAG_STATS: 'tags:getStats',
  GET_PHOTO_IDS_BY_TAG: 'tags:getPhotoIds',
  GET_PHOTOS_BY_TAG: 'tags:getPhotos',
  ADD_TAG_TO_PHOTO: 'tags:addToPhoto',
  REMOVE_TAG_FROM_PHOTO: 'tags:removeFromPhoto',

  FIND_DUPLICATES: 'duplicates:find',
  DELETE_PHOTO: 'photos:delete'
} as const
