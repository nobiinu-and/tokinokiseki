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
  DELETE_PHOTO: 'photos:delete',

  GET_DEFAULT_TIMELINE: 'timeline:getDefault',
  GET_TIMELINE_FOLDERS: 'timeline:getFolders',
  ADD_FOLDER_TO_TIMELINE: 'timeline:addFolder',
  REMOVE_FOLDER_FROM_TIMELINE: 'timeline:removeFolder',

  GET_EVENTS: 'events:getByTimeline',
  CREATE_EVENT: 'events:create',
  UPDATE_EVENT: 'events:update',
  DELETE_EVENT: 'events:delete',
  GET_EVENT_SUGGESTIONS: 'events:getSuggestions',
  GENERATE_EVENT_TITLE: 'events:generateTitle',
  ADD_DATE_TO_EVENT: 'events:addDate',
  ADD_DATES_TO_EVENT: 'events:addDates',
  REMOVE_DATE_FROM_EVENT: 'events:removeDate',
  GENERATE_EVENT_TITLE_FOR_DATES: 'events:generateTitleForDates',
  GET_EVENT_STATS: 'events:getStats'
} as const
