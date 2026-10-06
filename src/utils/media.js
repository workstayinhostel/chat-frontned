import { uploadConversationImage, uploadProfilePhoto } from '../mediaUtils.js';

export async function compressAndUploadImage(file, supabaseClient, bucketName = 'chat-media', options = {}) {
  if (!['chat-media', 'avatars', 'conversations', 'profiles'].includes(bucketName)) {
    throw new TypeError('Choose chat-media or avatars as the upload destination.');
  }
  const uploaded = bucketName === 'avatars'
    ? await uploadProfilePhoto(file, { ...options, supabaseClient })
    : await uploadConversationImage(file, { ...options, supabaseClient });
  return {
    mediaUrl: uploaded.url,
    fileKey: uploaded.fileKey,
    size: uploaded.size,
    mime: uploaded.mime
  };
}
