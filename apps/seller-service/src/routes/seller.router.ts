import isAuthenticated from '@packages/middleware/isAuthenticated';
import express, { Router } from 'express';
import { deleteShop, editSellerProfile, getSellerEvents, getSellerInfo, getSellerProducts, markNotificationAsRead, restoreShop, sellerNotifications, updateProfilePictures, uploadImage } from '../controllers/seller.controller';
import { isSeller } from '@packages/middleware/authorizeRoles';

const router:Router = express.Router();

router.delete("/delete", isAuthenticated, deleteShop);
router.patch("/restore", isAuthenticated, restoreShop);
router.post("/upload-image", isAuthenticated, uploadImage);
router.put("/update-image", isAuthenticated, updateProfilePictures);
router.put("/edit-profile", isAuthenticated, editSellerProfile);
router.get("/get-seller/:id", getSellerInfo);
router.get("/get-seller-products/:id", getSellerProducts);
router.get("/get-seller-events/:id", getSellerEvents);
router.get("/seller-notifications", isAuthenticated, isSeller, sellerNotifications);
router.get("/mark-notifications-as-read", isAuthenticated, markNotificationAsRead);

export default router;