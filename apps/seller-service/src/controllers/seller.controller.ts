import { AuthError, ForbiddenError, NotFoundError, ValidationError } from "@packages/error-handler";
import { imagekit } from "@packages/libs/imagekit";
import prisma from "@packages/libs/prisma";
import { NextFunction, Request, Response } from "express";
import { sendLog } from "@packages/utils/logs/send-logs";

//Delete shop (soft delete)
export const deleteShop = async (req: any, res: Response, next: NextFunction) => {
    try {
        const sellerId = req.seller?.id;

        //find seller with shop
        const seller = await prisma.sellers.findUnique({
            where: {
                id: sellerId
            },
            include: {
                shop: true
            },
        });

        if(!seller || !seller.shop) {
            return next(new NotFoundError("Seller or Shop not found!"));
        }

        //28 days from now
        const deletedAt = new Date();
        deletedAt.setDate(deletedAt.getDate() + 28);

        //soft delete both seller and shop
        await prisma.$transaction([
            prisma.sellers.update({
                where: {
                    id: sellerId
                },
                data: {
                    isDeleted: true,
                    deletedAt,
                },
            }),
            prisma.shops.update({
                where: {
                    id: sellerId
                },
                data: {
                    isDeleted: true,
                    deletedAt,
                },
            }),
        ]);

        await sendLog({ type: "success", message: `Marked shop and seller ${sellerId} for deletion`, source: "seller-service" });
        return res.status(200).json({ message: "Shop and Seller marked for deletion. Will be permanently deleted after 28 days."});
    } catch (error) {
        await sendLog({ type: "error", message: `Error in deleteShop: ${(error as any)?.message || error}`, source: "seller-service" });
        return next(error);
    }
};

//Restore shop 
export const restoreShop = async (req: any, res: Response, next: NextFunction) => {
    try {
        const sellerId = req.seller?.id;

        //find seller with shop
        const seller = await prisma.sellers.findUnique({
            where: {
                id: sellerId
            },
            include: {
                shop: true
            },
        });

        if(!seller || !seller.shop) {
            return next(new NotFoundError("Seller or Shop not found!"));
        }

        if(!seller.isDeleted || !seller.deletedAt || !seller.shop.isDeleted || !seller.shop.deletedAt) {
            return next(new ForbiddenError("Seller or Shop is not marked for deletion"));
        }

        const now = new Date();
        const deletedAt = new Date(seller.deletedAt);

        if(now > deletedAt) {
            return next(new ForbiddenError("Cannot restore. The 28-day recovery period has expired!"));
        }

        //restore both seller and shop
        await prisma.$transaction([
            prisma.sellers.update({
                where: {
                    id: sellerId
                },
                data: {
                    isDeleted: false,
                    deletedAt: null,
                },
            }),
            prisma.shops.update({
                where: {
                    id: sellerId
                },
                data: {
                    isDeleted: false,
                    deletedAt: null,
                },
            }),
        ]);

        await sendLog({ type: "success", message: `Restored shop and seller ${sellerId}`, source: "seller-service" });
        return res.status(200).json({ message: "Shop and seller have been successfully restored."});
    } catch (error) {
        await sendLog({ type: "error", message: `Error in restoreShop: ${(error as any)?.message || error}`, source: "seller-service" });
        return next(error);
    }
};

//Upload image to ImageKit
export const uploadImage = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { file, fileName, folder } = req.body;

        if(!file || !fileName || !folder) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields!"
            });
        }

        //upload image to ImageKit
        const uploadResponse = await imagekit.upload({
            file,
            fileName,
            folder,
        });

        return res.status(201).json({
            success: true,
            file_id: uploadResponse.fileId,
            url: uploadResponse.url,
        });
    } catch (error) {
        return next(error);
    }
};

//Update avatar & cover photo
export const updateProfilePictures = async (req: any, res: Response, next: NextFunction) => {
    try {   
        const { editType, imageUrl } = req.body;

        if(!editType || !imageUrl) {
            return next(new ValidationError("Missing required fields!"));
        }

        //ensure the user is authenticated
        if(!req.seller?.id) {
            return next(new AuthError("Only sellers can update profile picture"));
        }

        //determine update field (avatar or cover)
        const updateField = editType === "cover" ? {coverBanner: imageUrl} : {avatar: imageUrl};

        //update seller's profile
        const updatedSeller = await prisma.shops.update({
            where: {
                sellerId: req.seller.id
            },
            data: updateField,
            select: {
                id: true,
                avatar: true,
                coverBanner: true,
            },
        });

        res.status(200).json({
            success: true,
            message: `${
                editType === "cover" ? "Cover photo" : "Avatar"
            } updated successfully.`,
            updatedSeller,
        });
    } catch (error) {
        return next(error);
    }
};

//Edit seller profile
export const editSellerProfile = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { name, bio, address, opening_hours, website, socialLinks } = req.body;

        if(!name || !bio || !address || !opening_hours || !website ||!socialLinks) {
            return next(new ValidationError("Please fill all the fields!"));
        }

        //ensure the user is authticated
        if(!req.seller?.id) {
            return next(new AuthError("Only sellers can edit their profile"));
        }

        //check if the shop exists for the seller
        const existingShop = await prisma.shops.findUnique({
            where: {
                sellerId: req.seller.id
            },
        });

        if(!existingShop) {
            return next(new ValidationError("Shop not found for this seller"));
        }

        //update the shop profile
        const updatedShop = await prisma.shops.update({
            where: {
                sellerId: req.seller.id
            },
            data: {
                name,
                bio,
                address,
                opening_hours,
                website,
                socialLinks,
            },
            select: {
                id: true,
                name: true,
                bio: true,
                address: true,
                opening_hours: true,
                website: true,
                socialLinks: true,
                updatedAt: true,
            },
        });

        res.status(200).json({
            success: true,
            message: "Shop profile updated successfully",
            updatedShop,
        });
    } catch (error) {
        return next(error);
    }
};

//Get seller (public preview)
export const getSellerInfo = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const shop = await prisma.shops.findUnique({
            where: {
                id: req.params.id
            },
        });

        res.status(201).json({
            success: true,
            shop,
        });
    } catch (error) {
        next(error);
    }
};

//Get seller products (public preview)
export const getSellerProducts = async (req: any, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            prisma.products.findMany({
                where: {
                    starting_date: null,
                    shopId: req.query.id!,
                },
                skip,
                take: limit,
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    images: true,
                    Shop: true,
                },
            }),

            prisma.products.count({
                where: {
                    starting_date: null,
                    shopId: req.query.id!,
                },
            }),
        ]);

        res.status(200).json({
            success: true,
            products,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {   
        next(error);
    }
};

//Get seller events (public preview)
export const getSellerEvents = async (req: any, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            prisma.products.findMany({
                where: {
                    starting_date: {
                        not: null
                    },
                    shopId: req.query.id!,
                },
                skip,
                take: limit,
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    images: true,
                },
            }),

            prisma.products.count({
                where: {
                    starting_date: null,
                    shopId: req.query.id!,
                },
            }),
        ]);

        res.status(200).json({
            success: true,
            products,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
};

//Fetching notifications for sellers
export const sellerNotifications = async (req: any, res: Response, next: NextFunction) => {
    try {
        const sellerId = req.seller.id;

        const notifications = await prisma.notifications.findMany({
            where: {
                receiverId: sellerId
            },
            orderBy: {
                createdAt: "desc"
            },
        });

        res.status(200).json({ success: true, notifications });
    } catch (error) {
        next(error);
    }
};

//Mark notifications as read
export const markNotificationAsRead = async (req: any, res: Response, next: NextFunction) => {
    try {   
        const { notificationId } = req.body;
        
        if(!notificationId) {
            return next(new ValidationError("Notification id is required!"));
        }

        const notification = await prisma.notifications.update({
            where: {
                id: notificationId
            },
            data: {
                status: "Read"
            },
        });

        res.status(200).json({ success: true, notification });
    } catch (error) {
        next(error);
    }
};

//Follow shop
export const followShop = async (req: any, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const shopId = req.params.id;

        if(!userId) {
            return next(new AuthError("Login required"));
        }

        const shop = await prisma.shops.findUnique({
            where: { id: shopId }
        });

        if(!shop) {
            return next(new NotFoundError("Shop not found"));
        }

        if(shop.followers.includes(userId)) {
            return next(new ForbiddenError("Already following this shop"));
        }

        await prisma.shops.update({
            where: { id: shopId },
            data: {
                followers: {
                    push: userId,
                },
            },
        });

        res.status(200).json({ success: true, message: "Shop followed successfully" });
    } catch(error) {
        next(error);
    }
};

//Unfollow shop
export const unfollowShop = async (req: any, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const shopId = req.params.id;

        if(!userId) {
            return next(new AuthError("Login required"));
        }

        const shop = await prisma.shops.findUnique({
            where: { id: shopId }
        });

        if(!shop) {
            return next(new NotFoundError("Shop not found"));
        }

        if(!shop.followers.includes(userId)) {
            return next(new ForbiddenError("You are not following this shop"));
        }

        const updatedFollowers = shop.followers.filter(id => id !== userId);

        await prisma.shops.update({
            where: { id: shopId },
            data: {
                followers: updatedFollowers
            }
        });

        res.status(200).json({
            success: true,
            message: "Shop unfollowed successfully"
        });
    } catch(error) {
        next(error);
    }
};

//Check if user follows shop
export const isFollowing = async (req: any, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const shopId = req.params.id;

        if(!userId) {
            return next(new AuthError("Login required"));
        }

        const shop = await prisma.shops.findUnique({
            where: { id: shopId },
            select: { followers: true }
        });

        if(!shop) {
            return next(new NotFoundError("Shop not found"));
        }

        const following = shop.followers.includes(userId);

        res.status(200).json({
            success: true,
            following
        });
    } catch (error) {
        next(error);
    }
};