import { NotFoundError, ValidationError } from "@packages/error-handler";
import prisma from "@packages/libs/prisma";
import redis from "@packages/libs/redis";
import { NextFunction, Request, Response } from "express";
import { sendLog } from "@packages/utils/logs/send-logs";
import Stripe from "stripe";
import crypto from "crypto";
import { Prisma } from "generated/prisma";
import { sendEmail } from "../utils/send-email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-02-24.acacia",
});

//Create payment intent
export const createPaymentIntent = async(req: any, res: Response, next: NextFunction) => {
    const { amount, sellerStripeAccountId, sessionId } = req.body;
    const customerAmount = Math.round(amount * 100);
    const platformFee = Math.floor(customerAmount * 0.1);
    
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: customerAmount,
            currency: "usd",
            payment_method_types: ["card"],
            application_fee_amount: platformFee,
            transfer_data: {
                destination: sellerStripeAccountId,
            },
            metadata: {
                sessionId,
                userId: req.user.id
            }
        });

        res.send({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        next(error);
    }
};

//Create payment session
export const createPaymentSession = async(req: any, res: Response, next: NextFunction) => {
    try {
        const { cart, selectedAddressId, coupon } = req.body;
        const userId = req.user.id;

        if(!cart || !Array.isArray(cart) || cart.length === 0) {
            return next(new ValidationError("Cart is empty or invalid"));
        }

        const normalizedCart = JSON.stringify(
            cart.map((item: any) => ({
                id: item.id,
                quantity: item.quantity,
                sale_price: item.sale_price,
                shopId: item.shopId,
                selectedOptions: item.selectedOptions || {}
            }))
            .sort((a, b) => a.id.localCompare(b.id))
        );

        const keys = await redis.keys("payment-session:*");
        for(const key of keys) {
            const data = await redis.get(key);
            if(data) {
                const session = JSON.parse(data);
                if(session.userId === userId) {
                    const existingCart = JSON.stringify(
                        session.cart.map((item: any) => ({
                            id: item.id,
                            quantity: item.quantity,
                            sale_price: item.sale_price,
                            shopId: item.shopId,
                            selectedOptions: item.selectedOptions || {}
                        }))
                        .sort((a: any, b: any) => a.id.localCompare(b.id))
                    );

                    if(existingCart === normalizedCart) {
                        return res.status(200).json({ sessionId: key.split(":")[1] });
                    } else {
                        await redis.del(key);
                    }
                }
            }
        }

        //fetch sellers and their stripe accounts
        const uniqueShopIds = [...new Set(cart.map((item: any) => item.shopId))];

        const shops = await prisma.shops.findMany({
            where: {
                id: {in: uniqueShopIds}
            },
            select: {
                id: true,
                sellerId: true,
                sellers: {
                    select: {
                        stripeId: true,
                    },
                },
            },
        });

        const sellerData = shops.map((shop) => ({
            shopId: shop.id,
            sellerId: shop.sellerId,
            stripeAccountId: shop?.sellers?.stripeId,
        }));

        //calculate total amount
        const totalAmount = cart.reduce((total: number, item: any) => {
            return total + item.quantity * item.sale_price;
        }, 0);

        //create session payload
        const sessionId = crypto.randomUUID();
        const sessionData = {
            userId,
            cart,
            sellers: sellerData,
            totalAmount,
            shippingAddressId: selectedAddressId || null,
            coupon: coupon || null,
        };

        await redis.setex(
            `payment-session: ${sessionId}`,
            600,
            JSON.stringify(sessionData)
        );

        return res.status(201).json({ sessionId });
    } catch (error) {
        next(error);
    }
};

//Verify payment session
export const verifyPaymentSession = async(req: Request, res: Response, next: NextFunction) => {
    try {   
        const sessionId = req.query.sessionId as string;
        
        if(!sessionId) {
            return res.status(400).json({ error: "Session ID is required" });
        }

        //fetch session from redis
        const sessionKey = `payment-session:${sessionId}`;
        const sessionData = await redis.get(sessionKey);

        if(!sessionData) {
            return res.status(404).json({ error: "Session not found or expired." });
        }

        //parse and return session
        const session = JSON.parse(sessionData);

        return res.status(200).json({ success: true, session });
    } catch (error) {
        return next(error);
    }
};

//Create order
export const createOrder = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const stripeSignature = req.headers["stripe-signature"];
        if(!stripeSignature) {
            return res.status(400).send("Missing Stripe signature");
        }

        const rawBody = (req as any).rawBody;

        let event;
        try {
            event = stripe.webhooks.constructEvent(
                rawBody,
                stripeSignature,
                process.env.STRIPE_WEBHOOK_SECRET!,
            );
        } catch (err: any) {
            console.error("Webhook signature verification failed.", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if(event.type === "payment_intent.succeeded") {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const sessionId = paymentIntent.metadata.sessionId;
            const userId = paymentIntent.metadata.userId;

            const sessionKey = `payment-session:${sessionId}`;
            const sessionData = await redis.get(sessionKey);

            if(!sessionData) {
                console.warn("Session data expired or missing for", sessionId);
                return res.status(200).send("No session found, skipping order creation");
            } 

            const { cart, totalAmount, shippingAddressId, coupon } = JSON.parse(sessionData);
            const user = await prisma.users.findUnique({ where: { id: userId } });
            const name = user?.name!;
            const email = user?.email!;

            const shopGrouped = cart.reduce((acc: any, item: any) => {
                if(!acc[item.shopId])
                    acc[item.shopId] = [];
                acc[item.shopId].push(item);
                return acc;
            }, {});

            for(const shopId in shopGrouped) {
                const orderItems = shopGrouped[shopId];

                let orderTotal = orderItems.reduce(
                    (sum: number, p: any) => sum + p.quantity * p.sale_price, 0
                );

                //apply discount if applicable
                if(coupon && coupon.discountedProductId && orderItems.some((item: any) => item.id === coupon.discountedProductId)) {
                    const discountedItem = orderItems.find(
                        (item: any) => item.id === coupon.discountedProductId
                    );
                    if(discountedItem) {
                        const discount = coupon.discountPercent > 0
                            ? (discountedItem.sale_price * discountedItem.quantity * coupon.discountPercent) / 100
                            : coupon.discountAmount;

                        orderTotal -= discount;
                    }
                }

                //create order
                const order = await prisma.orders.create({
                    data: {
                        userId,
                        shopId,
                        total: orderTotal,
                        status: "Paid",
                        shippingAddressId: shippingAddressId || null,
                        couponCode: coupon?.code || null,
                        discountAmount: coupon?.discountAmount || 0,
                        items: {
                            create: orderItems.map((item: any) => ({
                                productId: item.id,
                                quantity: item.quantity,
                                price: item.sale_price,
                                selectedOptions: item.selectedOptions,
                            })),
                        },
                    },
                });

                //update product & analytics
                for(const item of orderItems) {
                    const { id: productId, quantity } = item;

                    await prisma.products.update({
                        where: {id: productId},
                        data: {
                            stock: {decrement: quantity},
                            totalSales: {increment: quantity},
                        },
                    });

                    await prisma.productAnalytics.upsert({
                        where: {productId},
                        create: {
                            productId,
                            shopId,
                            purchases: quantity,
                            lastViewedAt: new Date(),
                        },
                        update: {
                            purchases: {increment: quantity},
                        },
                    });

                    const existingAnalytics = await prisma.userAnalytics.findUnique({
                        where: { userId },
                    });

                    const newAction = {
                        productId,
                        shopId,
                        action: "purchase",
                        timeStamp: Date.now(),
                    };

                    const currentActions = Array.isArray(existingAnalytics?.actions)
                        ? (existingAnalytics.actions as Prisma.JsonArray)
                        : [];

                    if(existingAnalytics) {
                        await prisma.userAnalytics.update({
                            where: {userId},
                            data: {
                                lastVisited: new Date(),
                                actions: JSON.parse(JSON.stringify([...currentActions, newAction])),
                            },
                        });
                    } else {
                        await prisma.userAnalytics.create({
                            data: {
                                userId,
                                lastVisited: new Date(),
                                actions: [newAction],
                            },
                        });
                    }
                }

                //send email to user
                await sendEmail(
                    email,
                    "Your TradeSphere Order Confirmation",
                    "order-confirmation",
                    {
                        name,
                        cart,
                        totalAmount: coupon?.discountAmount
                            ? totalAmount - coupon?.discountAmount
                            : totalAmount,
                        trackingUrl: `http://localhost:3002/order/${order.id}`,
                    }
                );

                //create notifications for sellers
                const createdShopIds = Object.keys(shopGrouped);
                const sellerShops = await prisma.shops.findMany({
                    where: {id: {in: createdShopIds}},
                    select: {
                        id: true,
                        sellerId: true,
                        name: true,
                    },
                });
                
                for(const shop of sellerShops) {
                    const firstProduct = shopGrouped[shop.id][0];
                    const productTitle = firstProduct?.title || "new item";

                    await prisma.notifications.create({
                        data: {
                            title: "New Order Received",
                            message: `A customer just ordered ${productTitle} from your shop.`,
                            creatorId: userId,
                            receiverId: shop.sellerId,
                            redirect_link: `https://TradeSphere.com/order/${order.id}`,
                        },
                    });
                }

                //create notifications for admin
                await prisma.notifications.create({
                    data: {
                        title: "Platform Order Alert",
                        message: `A new order was placed by ${name}`,
                        creatorId: userId,
                        receiverId: "admin",
                        redirect_link: `https://TradeSphere.com/order/${sessionId}`,
                    },
                });

                await redis.del(sessionKey);
            }
        }
        await sendLog({ type: "success", message: `Stripe webhook processed for session ${'unknown'}`, source: "order-service" });
        res.status(200).json({ received: true });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in createOrder webhook: ${(error as any)?.message || error}`, source: "order-service" });
        return next(error);
    }
};

//Get sellers orders
export const getSellerOrders = async(req: any, res: Response, next: NextFunction) => {
    try {
        const shop = await prisma.shops.findUnique({
            where: {
                sellerId: req.seller.id,
            },
        });

        //fetch all orders for this shop
        const orders = await prisma.orders.findMany({
            where: {
                shopId: shop?.id,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        avatar: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        res.status(201).json({ success: true, orders });
    } catch (error) {
        next(error);
    }
};

//Get order details
export const getOrderDetails = async(req: any, res: Response, next: NextFunction) => {
    try {
        const orderId = req.params.id;

        const order = await prisma.orders.findUnique({
            where: {
                id: orderId,
            },
            include: {
                items: true,
            },
        });

        if(!order) {
            return next(new NotFoundError("Order not found with this id!"));
        }

        const shippingAddress = order.shippingAddressId ? await prisma.address.findUnique({
            where: {
                id: order?.shippingAddressId,
            },
        })
        : null;

        const coupon = order.couponCode ? await prisma?.discount_codes.findUnique({
            where: {
                discountCode: order.couponCode,
            },
        })
        : null;

        //fetch all products details in one go
        const productIds = order.items.map((item) => item.productId);

        const products = await prisma.products.findMany({
            where: {
                id: {in: productIds}
            },
            select: {
                id: true,
                title: true,
                images: true,
            },
        });

        const productMap = new Map(products.map((p) => [p.id, p]));

        const items = order.items.map((item) => ({
            ...item,
            selectedOptions: item.selectedOptions,
            product: productMap.get(item.productId) || null,
        }));

        res.status(200).json({
            success: true,
            order: {
                ...order,
                items,
                shippingAddress,
                couponCode: coupon,
            },
        });
    } catch (error) {
        next(error);
    }
};

//Update order status
export const updateDeliveryStatus = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const {orderId} = req.params;
        const {deliveryStatus} = req.body;
        
        if(!orderId || !deliveryStatus) {
            return res.status(400).json({ error: "Missing order ID or delivery status." });
        }

        const allowedStatuses = [
            "Ordered",
            "Packed",
            "Shipped",
            "Out for Delivery",
            "Delivered",
        ];

        if(!allowedStatuses.includes(deliveryStatus)) {
            return next(new ValidationError("Invalid delivery status"));
        }

        const existingOrder = await prisma.orders.findUnique({
            where: {
                id: orderId,
            },
        });

        if(!existingOrder) {
            return next(new NotFoundError("Order not found!"));
        }

        const updatedOrder = await prisma.orders.update({
            where: {
                id: orderId,
            },
            data: {
                status: deliveryStatus,
                updatedAt: new Date(),
            },
        });

        return res.status(200).json({
            success: true,
            message: "Delivery status updated successfully.",
            order: updatedOrder,
        });
    } catch (error) {
        return next(error);
    }
};

//Verify coupon code
export const verifyCouponCode = async(req: any, res: Response, next: NextFunction) => {
    try {
        const { couponCode, cart } = req.body;

        if(!couponCode || !cart || cart.length === 0) {
            return next(new ValidationError("Coupon code and cart are required!"));
        }

        //fetch the discount codes
        const discount = await prisma.discount_codes.findUnique({
            where: {
                discountCode: couponCode,
            },
        });

        if(!discount) {
            return next(new ValidationError("Coupon code isn't valid!"));
        }

        //find matching product that includes this discount code
        const matchingProduct = cart.find((item: any) => 
            item.discount_codes?.some((d: any) => d === discount.id)
        );
        
        if(!matchingProduct) {
            return res.status(200).json({
                valid: false,
                discount: 0,
                discountAmount: 0,
                message: "No matching product found in the cart for this coupon!"
            });
        }

        let discountAmount = 0;
        const price = matchingProduct.sale_price * matchingProduct.quantity;

        if(discount.discountType === "percentage") {
            discountAmount = (price * discount.discountValue) / 100;
        } else if(discount.discountType === "flat") {
            discountAmount = discount.discountValue;
        }

        //prevent discount from being greater than total price
        discountAmount = Math.min(discountAmount, price);

        await sendLog({ type: "success", message: `Coupon ${couponCode} verified for user ${req.user?.id || 'unknown'}`, source: "order-service" });
        res.status(200).json({
            valid: true,
            discount: discount.discountValue,
            discountAmount: discountAmount.toFixed(2),
            discountedProductId: matchingProduct.id,
            discountType: discount.discountType,
            message: "Discount applied to 1 eligible product",
        });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in verifyCouponCode: ${(error as any)?.message || error}`, source: "order-service" });
        next(error);
    }
};

//Get user orders
export const getUserOrders = async(req: any, res: Response, next: NextFunction) => {
    try {
        const orders = await prisma.orders.findMany({
            where: {
                userId: req.user.id,
            },
            include: {
                items: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        res.status(200).json({ success: true, orders });
    } catch (error) {
        return next(error);
    }
};

//Get admin orders
export const getAdminOrders = async(req: any, res: Response, next: NextFunction) => {
    try {
        const orders = await prisma.orders.findMany({
            include: {
                user: true,
                shop: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        res.status(200).json({ success: true, orders });
    } catch (error) {
        next(error);
    }
};  