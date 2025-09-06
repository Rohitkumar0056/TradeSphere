import prisma from "@packages/libs/prisma";
import cron from "node-cron";

cron.schedule("0 * * * *", async() => {
    try {
        const now = new Date();
        
        await prisma.sellers.deleteMany({
            where: {
                isDeleted: true,
                deletedAt: { lte: now },
            },
        }); 

        await prisma.shops.deleteMany({
            where: {
                isDeleted: true,
                deletedAt: { lte: now },
            },
        }); 

    } catch (error) {
        console.log(error);
    } 
});