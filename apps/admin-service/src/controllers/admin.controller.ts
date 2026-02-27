import { ValidationError } from "@packages/error-handler";
import prisma from "@packages/libs/prisma";
import { NextFunction, Request, Response } from "express";
import { sendLog } from "@packages/utils/logs/send-logs";

//Get all products
export const getAllProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [products, totalProducts] = await Promise.all([
            prisma.products.findMany({
                where: {
                    starting_date: null,
                },
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    sale_price: true,
                    stock: true,
                    createdAt: true,
                    ratings: true,
                    category: true,
                    images: {
                        select: { url: true },
                        take: 1,
                    },
                    Shop: {
                        select: { name: true },
                    },
                },
            }),
            prisma.products.count({
                where: {
                    starting_date: null,
                },
            }),
        ]);

        const totalPages = Math.ceil(totalProducts / limit);

        res.status(200).json({
            success: true,
            data: products,
            meta: {
                totalProducts,
                currentPage: page,
                totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Get all events
export const getAllEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [products, totalProducts] = await Promise.all([
            prisma.products.findMany({
                where: {
                    starting_date: { not: null },
                },
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    title: true,
                    slug: true,
                    sale_price: true,
                    stock: true,
                    createdAt: true,
                    ratings: true,
                    category: true,
                    images: {
                        select: { url: true },
                        take: 1,
                    },
                    Shop: {
                        select: { name: true },
                    },
                },
            }),
            prisma.products.count({
                where: {
                    starting_date: { not: null },
                },
            }),
        ]);

        const totalPages = Math.ceil(totalProducts / limit);

        res.status(200).json({
            success: true,
            data: products,
            meta: {
                totalProducts,
                currentPage: page,
                totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Get all admins
export const getAllAdmins = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const admins = await prisma.users.findMany({
            where: {
                role: "admin",
            },
        });

        res.status(201).json({ success: true, admins });
    } catch (error) {
        next(error);
    }
};

//Add new admin
export const addNewAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, role } = req.body;

        const isUser = await prisma.users.findUnique({
            where: {
                email
            },
        });

        if(!isUser) {
            return next(new ValidationError("Something went wrong!"));
        }

        const updateRole = await prisma.users.update({
            where: {
                email
            },
            data: {
                role
            },
        });

        await sendLog({ type: "success", message: `Updated admin role for ${email} to ${role}`, source: "admin-service" });
        res.status(201).json({ success: true, updateRole });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in addNewAdmin: ${(error as any)?.message || error}`, source: "admin-service" });
        next(error);
    }
};

//Fetch all customizations
export const getAllCustomizations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const config = await prisma.site_config.findFirst();

        return res.status(200).json({
            categories: config?.categories || [],
            subCategories: config?.subCategories || {},
            logo: config?.logo || null,
            banner: config?.banner || null,
        });
    } catch (error) {
        return next(error);
    }
};

//Add new customizations
export const addNewCustomizations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { categories, subCategories, logo, banner } = req.body;

        const existingConfig = await prisma.site_config.findFirst();

        // Validate input presence
        if (!categories && !subCategories && !logo && !banner) {
            return next(new ValidationError("At least one customization field is required."));
        }

        let updatedConfig;

        // If config already exists → update
        if (existingConfig) {
            updatedConfig = await prisma.site_config.update({
                where: { id: existingConfig.id },
                data: {
                    categories: categories ?? existingConfig.categories,
                    subCategories: subCategories ?? existingConfig.subCategories,
                    logo: logo ?? existingConfig.logo,
                    banner: banner ?? existingConfig.banner,
                },
            });

            await sendLog({ type: "success", message: `Site customization updated ${existingConfig.id}`, source: "admin-service" });
        }
        // Else → create new config
        else {
            updatedConfig = await prisma.site_config.create({
                data: {
                    categories: categories || [],
                    subCategories: subCategories || {},
                    logo: logo || null,
                    banner: banner || null,
                },
            });
        }

        res.status(201).json({
            success: true,
            config: updatedConfig,
        });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in addNewCustomizations: ${(error as any)?.message || error}`, source: "admin-service" });
        next(error);
    }
};

//Get all users
export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [users, totalUsers] = await Promise.all([
            prisma.users.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    createdAt: true,
                },
            }),
            prisma.users.count(),
        ]);

        const totalPages = Math.ceil(totalUsers / limit);

        res.status(200).json({
            success: true,
            data: users,
            meta: {
                totalUsers,
                currentPage: page,
                totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Get all sellers
export const getAllSellers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [sellers, totalSellers] = await Promise.all([
            prisma.sellers.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    createdAt: true,
                    shop: {
                        select: {
                            name: true,
                            avatar: true,
                            address: true,
                        },
                    },
                },
            }),
            prisma.sellers.count(),
        ]);

        const totalPages = Math.ceil(totalSellers / limit);

        res.status(200).json({
            success: true,
            data: sellers,
            meta: {
                totalSellers,
                currentPage: page,
                totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Get all notifications
export const getAllNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const notifications = await prisma.notifications.findMany({
            where: {
                receiverId: "admin"
            },
            orderBy: {
                createdAt: "desc"
            },
        });

        await sendLog({ type: "success", message: `Fetched admin notifications count ${notifications.length}`, source: "admin-service" });
        res.status(200).json({ success: true, notifications });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in getAllNotifications: ${(error as any)?.message || error}`, source: "admin-service" });
        next(error);
    }
};
 
//Get all users notification
export const getUserNotifications = async (req: any, res: Response, next: NextFunction) => {
    try {
        const notifications = await prisma.notifications.findMany({
            where: {
                receiverId: req.user.id
            },
            orderBy: {
                createdAt: "desc"
            },
        });

        await sendLog({ type: "success", message: `Fetched notifications for user ${req.user?.id || 'unknown'}`, source: "admin-service" });
        res.status(200).json({ success: true, notifications });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in getUserNotifications: ${(error as any)?.message || error}`, source: "admin-service" });
        next(error);
    }
};  