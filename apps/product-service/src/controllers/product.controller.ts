import { AuthError, ValidationError } from "@packages/error-handler";
import { imagekit } from "@packages/libs/imagekit";
import prisma from "@packages/libs/prisma";
import { NextFunction, Request, Response } from "express";
import { Prisma } from "generated/prisma";
import { sendLog } from "@packages/utils/logs/send-logs";

//Get product categories
export const getCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const config = await prisma.site_config.findFirst();

        if(!config) {
            await sendLog({ type: "error", message: "Categories not found", source: "product-service" });
            return res.status(404).json({ error: "Categories not found" });
        }

        return res.status(200).json({
            categories: config.categories,
            subCategories: config.subCategories,
        });
    } catch (error) {
        return next(error);
    }
};

//Create discount codes
export const createDiscountCodes = async (req: any, res: Response, next: NextFunction) => {
    try {
        const {public_name, discountType, discountValue, discountCode} = req.body;

        const isDiscountCodeExist = await prisma.discount_codes.findUnique({
            where: {
                discountCode
            }
        });

        if(isDiscountCodeExist) {
            return next(new ValidationError("Discount code already available pleaes use a different code!"));
        }

        const discount_code = await prisma.discount_codes.create({
            data: {
                public_name,
                discountType,
                discountValue: parseFloat(discountValue),
                discountCode,
                sellerId: req.seller.id,
            },
        });

        await sendLog({ type: "success", message: `Created discount code ${discountCode} for seller ${req.seller?.id || 'unknown'}`, source: "product-service" });
        res.status(201).json({ success: true, discount_code });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in createDiscountCodes: ${(error as any)?.message || error}`, source: "product-service" });
        next(error);
    }
};

//Get discount codes
export const getDiscountCodes = async (req: any, res: Response, next: NextFunction) => {
    try {
        const discount_codes = await prisma.discount_codes.findMany({
            where: {
                sellerId: req.seller.id,
            },
        });

        res.status(201).json({ success: true, discount_codes });
    } catch (error) {
        return next(error);
    }
};

//Delete discount code
export const deleteDiscountCode = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const sellerId = req.seller?.id;

        const discountCode = await prisma.discount_codes.findUnique({
            where: {id},
            select: {id: true, sellerId: true},
        });

        if(!discountCode) {
            return next(new ValidationError("Discount code not found!"));
        }

        if(discountCode.sellerId != sellerId) {
            return next(new ValidationError("Unauthorized access!"));
        }

        await prisma.discount_codes.delete({ where: { id } });

        await sendLog({ type: "success", message: `Deleted discount code ${id} by seller ${sellerId}`, source: "product-service" });
        return res.status(200).json({ message: "Discount code successfully deleted" });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in deleteDiscountCode: ${(error as any)?.message || error}`, source: "product-service" });
        next(error);
    }
};

//Upload product image
export const uploadProductImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {fileName} = req.body;

        const response = await imagekit.upload({
            file: fileName,
            fileName: `product-${Date.now()}.jpg`,
            folder: "/products",
        });

        res.status(201).json({ file_url: response.url, fileId: response.fileId });
    } catch (error) {
        next(error);
    }
};

//Delte product image
export const deleteProductImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {fileId} = req.body;

        const response = await imagekit.deleteFile(fileId);

        res.status(201).json({ success: true, response});
    } catch (error) {
        next(error);
    }
};

//Create product
export const createProduct = async (req: any, res: Response, next: NextFunction) => {
    try {
        const {
            title, 
            short_description, 
            detailed_description,
            warranty,
            custom_specifications,
            slug,
            tags,
            cash_on_delivery,
            brand,
            video_url,
            category,
            colors = [],
            sizes = [],
            discountCodes,
            stock,
            sale_price,
            regular_price,
            subCategory,
            customProperties = {},
            images = []
        } = req.body;

        if(!title || 
            !slug || 
            !short_description || 
            !category ||
            !subCategory ||
            !sale_price ||
            !images ||
            !tags ||
            !stock ||
            !regular_price
        ) {
            return next(new ValidationError("Missing required fields"));
        }

        if(!req.seller.id) {
            return next(new AuthError("Only seller can create products!"));
        }

        const slugChecking = await prisma.products.findUnique({
            where: {
                slug,
            },
        });

        if(slugChecking) {
            return next(new ValidationError("Slug already exist! Please use a differnet slug!"));
        }

        const newProduct = await prisma.products.create({
            data: {
                title,
                short_description,
                detailed_description,
                warranty,
                cashOnDelivery: cash_on_delivery,
                slug,
                shopId: req.seller?.shop?.id,
                tags: Array.isArray(tags) ? tags: tags.split(","),
                brand,
                video_url,
                category,
                subCategory,
                colors: colors || [],
                discount_codes: discountCodes.map((codeId: string) => codeId),
                sizes: sizes || [],
                stock: parseInt(stock),
                sale_price: parseFloat(sale_price),
                regular_price: parseFloat(regular_price),
                custom_properties: customProperties || {},
                custom_specifications: custom_specifications || {},
                images: {
                    create: images.filter((img: any) => img && img.fileId && img.file_url).map((img: any) => ({
                        file_id: img.fileId,
                        url: img.file_url,
                    })),
                },
            }, include: {images: true},
        });

        await sendLog({ type: "success", message: `Created product ${newProduct.id} by seller ${req.seller?.id || 'unknown'}`, source: "product-service" });
        res.status(201).json({ success: true, newProduct });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in createProduct: ${(error as any)?.message || error}`, source: "product-service" });
        next(error);
    }
};

//Get logged in seller products
export const getShopProducts = async (req: any, res: Response, next: NextFunction) => {
    try {
        const products = await prisma.products.findMany({
            where: {
                shopId: req?.seller?.shop?.id,
            },
            include: {
                images: true,
            },
        });
        
        res.status(201).json({ success: true, products});
    } catch (error) {
        next(error);
    }
};

//Delete product
export const deleteProduct = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { productId } = req.params;
        const sellerId = req.seller?.shop?.id;

        const product = await prisma.products.findUnique({
            where: {id: productId},
            select: {id: true, shopId: true, isDeleted: true},
        });

        if(!product) {
            return next(new ValidationError("Product not found"));
        }

        if(product.shopId != sellerId) {
            return next(new ValidationError("Unauthorized action"));
        }

        if(product.isDeleted) {
            return next(new ValidationError("Product is already deleted"));
        }

        const deletedProduct = await prisma.products.update({
            where: { id: productId },
            data: {
                isDeleted: true,
                deletedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });

        await sendLog({ type: "success", message: `Scheduled product ${productId} for deletion`, source: "product-service" });
        return res.status(200).json({
            message: "Product is scheduled for deletion in 24 hours. You can restore it within this this",
            deletedAt: deletedProduct.deletedAt,
        })
    } catch (error) {
        await sendLog({ type: "error", message: `Error in deleteProduct: ${(error as any)?.message || error}`, source: "product-service" });
        return next(error);
    }
};

//Restore product
export const restoreProduct = async (req: any, res: Response, next: NextFunction) => {
    try {
        const { productId } = req.params;
        const sellerId = req.seller?.shop?.id;

        const product = await prisma.products.findUnique({
            where: {id: productId},
            select: {id: true, shopId: true, isDeleted: true},
        });

        if(!product) {
            return next(new ValidationError("Product not found"));
        }

        if(product.shopId != sellerId) {
            return next(new ValidationError("Unauthorized action"));
        }

        if(!product.isDeleted) {
            return res.status(400).json({ messgae: "Product is not in deleted state" });
        }

        await prisma.products.update({
            where: { id: productId },
            data: {
                isDeleted: false,
                deletedAt: null,
            },
        });

        await sendLog({ type: "success", message: `Restored product ${productId}`, source: "product-service" });
        return res.status(200).json({
            message: "Product restored successfully!",
        })
    } catch (error) {
        await sendLog({ type: "error", message: `Error in restoreProduct: ${(error as any)?.message || error}`, source: "product-service" });
        return res.status(500).json({ message: "Error restoring product", error });
    }
};

//Get seller stripe Account
export const getStripeAccount = async (req: any, res: Response, next: NextFunction) => {
    try {
        if (!req.seller?.id) {
            return next(new AuthError("Unauthorized! Only sellers can access this endpoint."));
        }

        const seller = await prisma.sellers.findUnique({
            where: { id: req.seller.id },
            select: { id: true, name: true, email: true, stripeId: true },
        });

        if (!seller) {
            return next(new ValidationError("Seller not found!"));
        }

        if (!seller.stripeId) {
            return res.status(404).json({
                success: false,
                message: "Stripe account not connected yet!",
            });
        }

        return res.status(200).json({
            success: true,
            seller: {
                id: seller.id,
                name: seller.name,
                email: seller.email,
                stripeId: seller.stripeId,
            },
        });
    } catch (error) {
        return next(error);
    }
};

//Get all products
export const getAllProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const type = req.query.type;

        const baseFilter = {
            isDeleted: { not: true },
            // OR: [{
            //     starting_date: {equals: null},
            // }, {
            //     ending_date: {equals: null},    
            // }],
        };

        const orderBy: Prisma.productsOrderByWithRelationInput =
            type === "latest"
                ? {createdAt: "desc" as Prisma.SortOrder}
                : {totalSales: "desc" as Prisma.SortOrder};
        
        const [products, total, top10Products] = await Promise.all([
            prisma.products.findMany({
                skip,
                take: limit,
                include: {
                    images: true,
                    Shop: true,
                },
                where: baseFilter,
                orderBy: {
                    totalSales: "desc",
                },
            }),
            prisma.products.count({ where: baseFilter }),
            prisma.products.findMany({
                take: 10,
                where: baseFilter,
                orderBy,
            }),
        ]);

        res.status(200).json({
            products,
            top10By: type === "latest" ? "latest" : "topSales",
            top10Products,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        next(error);
    }
};

//Get all offers
export const getAllEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
  
        const baseFilter = {
            AND: [{
                starting_date: {not: null},
            }, {
                ending_date: {not: null},    
            }],
        };
        
        const [events, total, top10Sales] = await Promise.all([
            prisma.products.findMany({
                skip,
                take: limit,
                include: {
                    images: true,
                    Shop: true,
                },
                where: baseFilter,
                orderBy: {
                    totalSales: "desc",
                },
            }),
            prisma.products.count({ where: baseFilter }),
            prisma.products.findMany({
                take: 10,
                where: baseFilter,
                orderBy: {
                    totalSales: "desc"
                },
            }),
        ]);

        res.status(200).json({
            events,
            top10Sales,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch events. "});
    }
};

//Get product details
export const getProductDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const product = await prisma.products.findUnique({
            where: {
                slug: req.params.slug!,
            },
            include: {
                images: true,
                Shop: true,
            },
        });

        res.status(201).json({ success: true, product });
    } catch (error) {
        return next(error);   
    }
};

//Get filtered products
export const getFilteredProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            priceRange = [0, 10000],
            categories = [],
            colors = [],
            sizes = [],
            page = 1,
            limit = 12,
        } = req.query;

        const parsedPriceRange = typeof priceRange === "string"
            ? priceRange.split(",").map(Number)
            : [0, 10000];
        
        const parsedPage = Number(page);
        const parsedLimit = Number(limit);

        const skip = (parsedPage - 1) * parsedLimit;

        const filters: Record<string, any> = {
            sale_price: {
                gte: parsedPriceRange[0],
                lte: parsedPriceRange[1],
            },
            starting_date: null,
        };

        if(categories && (categories as string[]).length > 0) {
            filters.category = {
                in: Array.isArray(categories)
                    ? categories
                    : String(categories).split(","),
            };
        }

        if(colors && (colors as string[]).length > 0) {
            filters.colors = {
                hasSome: Array.isArray(colors) ? colors : [colors],
            };
        }

        if(sizes && (sizes as string[]).length > 0) {
            filters.sizes = {
                hasSome: Array.isArray(sizes) ? sizes : [sizes],
            };
        }

        const [products, total] = await Promise.all([
            prisma.products.findMany({
                where: filters,
                skip,
                take: parsedLimit,
                include: {
                    images: true,
                    Shop: true,
                },
            }),
            prisma.products.count({ where: filters }),
        ]);

        const totalPages = Math.ceil(total / parsedLimit);

        res.json({
            products,
            pagination: {
                total,
                page: parsedPage,
                totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Get filtered offers
export const getFilteredEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            priceRange = [0, 10000],
            categories = [],
            colors = [],
            sizes = [],
            page = 1,
            limit = 12,
        } = req.query;

        const parsedPriceRange = typeof priceRange === "string"
            ? priceRange.split(",").map(Number)
            : [0, 10000];
        
        const parsedPage = Number(page);
        const parsedLimit = Number(limit);

        const skip = (parsedPage - 1) * parsedLimit;

        const filters: Record<string, any> = {
            sale_price: {
                gte: parsedPriceRange[0],
                lte: parsedPriceRange[1],
            },
            NOT: {
                starting_date: null,
            },
        };

        if(categories && (categories as string[]).length > 0) {
            filters.category = {
                in: Array.isArray(categories)
                    ? categories
                    : String(categories).split(","),
            };
        }

        if(colors && (colors as string[]).length > 0) {
            filters.colors = {
                hasSome: Array.isArray(colors) ? colors : [colors],
            };
        }

        if(sizes && (sizes as string[]).length > 0) {
            filters.sizes = {
                hasSome: Array.isArray(sizes) ? sizes : [sizes],
            };
        }

        const [products, total] = await Promise.all([
            prisma.products.findMany({
                where: filters,
                skip,
                take: parsedLimit,
                include: {
                    images: true,
                    Shop: true,
                },
            }),
            prisma.products.count({ where: filters }),
        ]);

        const totalPages = Math.ceil(total / parsedLimit);

        res.json({
            products,
            pagination: {
                total,
                page: parsedPage,
                totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Get filtered shops
export const getFilteredShops = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            categories = [],
            countries = [],
            page = 1,
            limit = 12,
        } = req.query;
        
        const parsedPage = Number(page);
        const parsedLimit = Number(limit);
        const skip = (parsedPage - 1) * parsedLimit;

        const filters: Record<string, any> = {};

        if(categories && String(categories).length > 0) {
            filters.category = {
                in: Array.isArray(categories)
                    ? categories
                    : String(categories).split(","),
            };
        }

        if(countries && String(countries).length > 0) {
            filters.country = {
                in: Array.isArray(countries) ? countries : String(countries).split(","),
            };
        }

        const [shops, total] = await Promise.all([
            prisma.shops.findMany({
                where: filters,
                skip,
                take: parsedLimit,
                include: {
                    sellers: true,
                    //followers: true,
                    products: true,
                },
            }),
            prisma.shops.count({ where: filters }),
        ]);

        const totalPages = Math.ceil(total / parsedLimit);

        res.json({
            shops,
            pagination: {
                total,
                page: parsedPage,
                totalPages,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Search products
export const searchProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = req.query.q as string;

        if(!query || query.trim().length === 0) {
            return res.status(400).json({ message: "Search query is required." });
        }

        const products = await prisma.products.findMany({
            where: {
                OR: [
                    {
                        title: {
                            contains: query,
                            mode: "insensitive",
                        },
                    },
                    {
                        short_description: {
                            contains: query,
                            mode: "insensitive",
                        },
                    },
                ],
            },
            select: {
                id: true,
                title: true,
                slug: true,
            },
            take: 10,
            orderBy: {
                createdAt: "desc",
            },
        });

        return res.status(200).json({ products });
    } catch (error) {
        return next(error);
    }
};

//Get top shops
export const topShops = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const topShopsData = await prisma.orders.groupBy({
            by: ["shopId"],
            _sum: {
                total: true,
            },
            orderBy: {
                _sum: {
                    total: "desc",
                },
            },
            take: 10,
        });

        const shopIds = topShopsData.map((item: any) => item.shopId);
        
        const shops = await prisma.shops.findMany({
            where: {
                id: {
                    in: shopIds,
                },
            },
            select: {
                id: true,
                name: true,
                avatar: true,
                coverBanner: true,
                address: true,
                ratings: true,
                followers: true,
                category: true,
            },
        });

        const enrichedShops = shops.map((shop) => {
            const salesData = topShopsData.find((s: any) => s.shopId === shop.id);
            return {
                ...shop,
                totalSales: salesData?._sum.total ?? 0,
            };
        });

        const top10Shops = enrichedShops
            .sort((a, b) => b.totalSales - a.totalSales)
            .slice(0, 10);

        return res.status(200).json({ shops: top10Shops });
    } catch (error) {
        return next(error);
    }
};