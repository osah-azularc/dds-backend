/**
 * EFS Base Path Utility
 *
 * Reads and validates EFS_BASE_PATH, shared by all EFS-backed storage services.
 */

export const getEfsBasePath = () => {
  const basePath = process.env.EFS_BASE_PATH;
  if (!basePath || typeof basePath !== 'string' || basePath.trim() === '') {
    throw new Error('EFS_BASE_PATH is required for EFS template storage');
  }
  return basePath.trim();
};
