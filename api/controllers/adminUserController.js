/**
 * @file adminUserContoller.js
 * @description Compatibility barrel for admin user-management handlers.
 */

export {
  usersAddEdit,
  admin_GetAllUsers,
  getAgencyPlatform,
} from "./adminUsersCrudController.js";

export {
  updateAgencyUserAction,
  getAgencyUsersAction,
} from "./adminAgencyUsersController.js";

export {
  getCmaList,
  getExternalDocumentTypes,
  getAllPendingDocuments,
  updateCma,
} from "./adminExternalDocumentsController.js";
