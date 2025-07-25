export enum CaseStatusEnum {
  NEW = 'NEW',
  PENDING = 'PENDING',
  PROCESS = 'PROCESS',
  SUCCESS = 'SUCCESS',
  CANCEL = 'CANCEL',
}

export const StatusMapping = {
  NEW: ['T0', 'T0.2', 'T0.3', 'T1', 'T1.2', 'T1.3'],
  PENDING: ['T3'],
  PROCESS: ['T5', 'T6', 'T7'],
  SUCCESS: ['T8', 'T8A', 'T8B'],
}

export enum CaseHistoryAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export enum ActionType {
  MERGE_MUSIC = 'merge_music',
  VIDEO_POST_FACEBOOK = 'video_post_facebook',
  MERGE_VIDEO = 'merge_video',
  GENERATE_VIDEO = 'generate_video',
  GENERATE_VIDEO_CAPTION = 'generate_video_caption',
  GENERATE_IMAGE = 'generate_image',
  GENERATE_IMAGE_CAPTION = 'generate_image_caption',
}

