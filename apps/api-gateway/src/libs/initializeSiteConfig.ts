import { PrismaClient } from "../../../../generated/prisma";

const prisma = new PrismaClient();

const initializeSiteConfig = async () => {
    try {
        const existingConfig = await prisma.site_config.findFirst();
        if(!existingConfig) {
            await prisma.site_config.create({
                data: {
                    categories: [
                        "Electronics",
                        "Fashion",
                        "Home & Kitchen",
                        "Sports & Fitness",
                    ],
                    subCategories: {
                        "Electronics": ["Mobiles", "Laptops", "Accessories", "Gaming"],
                        "Fashion": ["Men", "Women", "Kids", "Footwear"],
                        "Home & Kitchen": ["Furniture, Decor", "Appliances"],
                        "Sports & Fitness": ["Gym Equipment", "Outdoor Sports", "Wearables"],
                    }
                }
            })
        }
    } catch (error) {
        console.error("Error initializing site config:", error);
    }
};

export default initializeSiteConfig;