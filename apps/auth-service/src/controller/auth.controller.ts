import { NextFunction, Request, Response } from "express";
import { validateRegistrationData, checkOtpRestrictions, trackOtpRequests, sendOtp, verifyOtp, handleForgotPassword, verifyForgotPasswordOtp } from "../utils/auth.helper";
import prisma from "@packages/libs/prisma";
import { ValidationError, AuthError, NotFoundError } from "@packages/error-handler";
import bcrypt from "bcryptjs";
import jwt, { JsonWebTokenError } from "jsonwebtoken";
import { setCookie } from "../utils/cookies/setCookie";
import Stripe from "stripe";
import { sendLog } from "@packages/utils/logs/send-logs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-02-24.acacia",
});

//Register a new user
export const userRegistration = async (req: Request, res: Response, next: NextFunction) => {
    try {
        //Validating the entered data
        validateRegistrationData(req.body, "user");

        const { name, email } = req.body;

        //Checking if the user already exists in the database
        const existingUser = await prisma.users.findUnique({where: {email} });

        if(existingUser) {
            return next(new ValidationError("User already exists with this email!"));
        }

        //Sending and tracking OTP requests if it is a new user
        await checkOtpRestrictions(email, next);
        await trackOtpRequests(email, next);
        await sendOtp(name, email, "user-activation-mail");
        res.status(200).json({
            messgae: "OTP send to email. Please verify your account.",
        });
    } catch (error) {
        return next(error);
    }
};

//Verify user with OTP
export const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, otp, password, name } = req.body;

        if(!email || !otp || !password) {
            return next(new ValidationError("All fields are required!"));
        }

        const existingUser = await prisma.users.findUnique({where: {email} });

        if(existingUser) {
            return next(new ValidationError("User akready exists with this email!"));
        }

        //Verifying the OTP entered by the user
        await verifyOtp(email, otp, next);

        //Creating a hashed password
        const hashedPassword = await bcrypt.hash(password, 10);

        //Creating a new user in the database
        await prisma.users.create({
            data: { name, email, password: hashedPassword },
        });

        res.status(200).json({
            success: true,
            message: "User registered successfully!",
        });
    } catch (error) {
        return next(error);
    }
};

//Login user
export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        if(!email || !password) {
            return next(new ValidationError("Email and password are required!"));
        }

        //Find user in the database
        const user = await prisma.users.findUnique({where: {email} });

        if(!user) return next(new AuthError("User doesn't exist!"));

        //Verify the password entered by the user
        const isMatch = await bcrypt.compare(password, user.password!);

        if(!isMatch) {
            return next(new AuthError("Invalid email or password!"));
        }

        res.clearCookie("seller-access-token");
        res.clearCookie("seller-refresh-token");

        //Generate access and refresh roken
        const accessToken = jwt.sign(
            {id: user.id, role: "user"},
            process.env.ACCESS_TOKEN_SECRET as string,
            {
                expiresIn: "15m",
            }
        );
        
        const refreshToken = jwt.sign(
            {id: user.id, role: "user"},
            process.env.REFRESH_TOKEN_SECRET as string,
            {
                expiresIn: "7d",
            }
        );

        //Store the refresh and access token in an httpOnly secure cookie
        setCookie(res, "refresh_token", refreshToken);
        setCookie(res, "access_token", accessToken);

        res.status(200).json({
            message: "Login successful!",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        return next(error);
    }
};

//Logout user
export const logOutUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.clearCookie("access_token");
        res.clearCookie("refresh_token");
        res.status(200).json({ success: true });
    } catch(error) {
        next(error);
    }
};

//Refresh token
export const refreshToken = async (req: any, res: Response, next: NextFunction) => {
    try {
        const refreshToken = 
            req.cookies["refresh_token"] ||
            req.cookies["seller-refresh-token"] ||
            req.headers.authorization?.split(" ")[1];

        if(!refreshToken) {
            return new ValidationError("Unauthorized! No refresh token.");
        }

        const decoded = jwt.verify(
            refreshToken,
            process.env.REFRESH_TOKEN_SECRET as string
        ) as {id: string; role: string};

        if(!decoded || !decoded.id || !decoded.role) {
            return new JsonWebTokenError('Forbidden! Invalid refresh token.');
        }

        let account;
        if(decoded.role === "user") {
            account = await prisma.users.findUnique({ where: { id: decoded.id } });
        } 
        else if(decoded.role === "seller") {
            account = await prisma.sellers.findUnique({ where: { id: decoded.id }, include: {shop: true} });
        }
        

        if(!account) {
            return new AuthError("Forbidden! User/Seller not found.");
        }

        const newAccessToken = jwt.sign(
            { id: decoded.id, role: decoded.role },
            process.env.ACCESS_TOKEN_SECRET as string,
            { expiresIn: "15m" }
        );

        if(decoded.role === "user") {
            setCookie(res, "access_token", newAccessToken);
        }
        else if(decoded.role === "seller") {
            setCookie(res, "seller-access-token", newAccessToken);
        }

        req.role = decoded.role;
        return res.status(201).json({ success: true });
    } catch (error) {
        return next(error);
    }
};

//Get logged in user info
export const getUser = async (req: any, res: Response, next: NextFunction) => {
    try {
        const user = req.user;
        res.status(201).json({ success: true, user });
    } 
    catch (error) {
        next(error);
    }
};  

//User forgot password
export const userForgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    await handleForgotPassword(req, res, next, "user");
};

//Verify forgot password OTP
export const verifyUserForgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    await verifyForgotPasswordOtp(req, res, next);
};

//Reset user password
export const resetUserPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, newPassword } = req.body;

        if(!email || !newPassword) {
            return next(new ValidationError("Email and new password are required!"));
        }

        const user = await prisma.users.findUnique({where: {email} });

        if(!user) return next(new ValidationError("User not found!"));

        //Compare new password with the old password
        const isSamePassword = await bcrypt.compare(newPassword, user.password!);

        if(isSamePassword) {
            return next(new ValidationError("New password cannot be same as old password!"));
        }

        //Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.users.update({
            where: { email },
            data: { password: hashedPassword },
        });

        res.status(200).json({
            message: "Password reset successfully!",
        });
    } catch (error) {
        next(error);
    }
};

//Update user password
export const updateUserPassword = async (req: any, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if(!currentPassword || !newPassword || !confirmPassword) {
            return next(new ValidationError("All fields are required"));
        }

        if(newPassword != confirmPassword) {
            return next(new ValidationError("New passwords do not match"));
        }

        if(currentPassword === newPassword) {
            return next(new ValidationError("New password cannot be same as old password"));
        }
        
        const user = await prisma.users.findUnique({
            where: {id: userId},
        });

        if(!user || !user.password) {
            return next(new AuthError("User not found or password not set!"));
        }

        const isPasswordCorrect = await bcrypt.compare(
            currentPassword,
            user.password,
        );

        if(!isPasswordCorrect) {
            return next(new AuthError("Current password is incorrect"));
        }

       const hashedPassword = await bcrypt.hash(newPassword, 12);

        await prisma.users.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });

        res.status(200).json({ message: "Password updated successfully!" });
    } catch (error) {
        next(error);
    }
};

//Register a new seller
export const registerSeller = async (req: Request, res: Response, next: NextFunction) => {
    try {
        validateRegistrationData(req.body, "seller");
        const {name, email} = req.body;

        const existingSeller = await prisma.sellers.findUnique({
            where: {email}
        });

        if(existingSeller) {
            throw new ValidationError("Seller already exists with this email!");
        }
        
        await checkOtpRestrictions(email, next);
        await trackOtpRequests(email, next);
        await sendOtp(name, email, "seller-activation");
        res.status(200).json({ message: "OTP sent to email. Please verify your account." });
    } catch(error) {
        await sendLog({ type: "error", message: `Error in registerSeller: ${(error as any)?.message || error}`, source: "auth-service" });
        next(error);
    }
};

//Verify seller with OTP
export const verifySeller = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {email, otp, password, name, phone_number, country} = req.body;
        
        if(!email || !otp || !password || !name || !phone_number || !country) {
            return next(new ValidationError("All fields are required!"));
        }

        const existingSeller = await prisma.sellers.findUnique({
            where: { email },
        });

        if(existingSeller) {
            throw new ValidationError("Seller already exists with this email!");
        }        

        await verifyOtp(email, otp, next);
        const hashedPassword = await bcrypt.hash(password, 10);

        const seller = await prisma.sellers.create({
            data: {
                name,
                email,
                password: hashedPassword,
                country,
                phone_number
            },
        });

        res.status(200).json({ message: "Seller registered successfully!", seller});
    } catch (error) {
        await sendLog({ type: "error", message: `Error in verifySeller: ${(error as any)?.message || error}`, source: "auth-service" });
        next(error);
    }
};

//Create a new shop
export const createShop = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {name, bio, address, opening_hours, website, category, sellerId} = req.body;

        if(!name || !bio || !address || !opening_hours || !category || !sellerId) {
            return next(new ValidationError("All fields are required!"));
        }

        const shopData: any = {
            name,
            bio,
            address,
            opening_hours,
            category,
            sellerId
        };

        if(website && website.trim() != "") {
            shopData.website = website;
        }

        const shop = await prisma.shops.create({
            data: shopData,
        });

        await sendLog({ type: "success", message: `Shop created ${shop.id}`, source: "auth-service" });
        res.status(201).json({success: true, shop});
    } catch (error) {
        await sendLog({ type: "error", message: `Error in createShop: ${(error as any)?.message || error}`, source: "auth-service" });
        next(error);
    }
};

//Create stripe connect account link
export const createStripeConnectLink = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {sellerId} = req.body;

        if(!sellerId) {
            return next(new ValidationError("Seller ID is required!"));
        }

        const seller = await prisma.sellers.findUnique({
            where: {
                id: sellerId,
            },
        });

        if(!seller) {
            return next(new ValidationError("Seller is not available with this id!"));
        }

        const account = await stripe.accounts.create({
            type: "express",
            email: seller?.email,
            country: "GB",
            capabilities: {
                card_payments: {requested: true},
                transfers: {requested: true}
            }
        });

        await prisma.sellers.update({
            where: {
                id: sellerId,
            },
            data: {
                stripeId: account.id,
            },
        });
        
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `http://localhost:3000/success`,
            return_url: `http://localhost:3000/success`,
            type: "account_onboarding",
        });

        res.json({ url: accountLink.url });
    } catch (error) {       
        return next(error);
    }
};

//Login seller
export const loginSeller = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        if(!email || !password) {
            return next(new ValidationError("Email and password are required!"));
        }

        //Find user in the database
        const seller = await prisma.sellers.findUnique({where: {email} });

        if(!seller) return next(new AuthError("Seller doesn't exist!"));

        //Verify the password entered by the user
        const isMatch = await bcrypt.compare(password, seller.password!);

        if(!isMatch) {
            return next(new AuthError("Invalid email or password!"));
        }

        res.clearCookie("access_token");
        res.clearCookie("refresh_token");

        //Generate access and refresh roken
        const accessToken = jwt.sign(
            {id: seller.id, role: "seller"},
            process.env.ACCESS_TOKEN_SECRET as string,
            {
                expiresIn: "15m",
            }
        );
        
        const refreshToken = jwt.sign(
            {id: seller.id, role: "seller"},
            process.env.REFRESH_TOKEN_SECRET as string,
            {
                expiresIn: "7d",
            }
        );

        //Store the refresh and access token in an httpOnly secure cookie
        setCookie(res, "seller-refresh-token", refreshToken);
        setCookie(res, "seller-access-token", accessToken);

        res.status(200).json({
            message: "Login successful!",
            seller: {
                id: seller.id,
                name: seller.name,
                email: seller.email,
            },
        });
    } catch (error) {
        return next(error);
    }
};

//Logout user
export const logOutSeller = async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.clearCookie("seller-access-token");
        res.clearCookie("seller-refresh-token");
        res.status(200).json({ success: true });
    } catch(error) {
        next(error);
    }  
};

//Get logged in seller
export const getSeller = async (req: any, res: Response, next: NextFunction) => {
    try {
        const seller = req.seller;
        res.status(201).json({ success: true, seller });
    } 
    catch (error) {
        next(error);
    }
};  

//Add new address
export const addUserAddress = async (req: any, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const { label, name, street, city, zip, country, isDefault } = req.body;

        if(!label || !name || !street || !city || !zip || !country) {
            return next(new ValidationError("All fields are required"));
        }

        if(isDefault) {
            await prisma.address.updateMany({
                where: {
                    userId,
                    isDefault: true,
                },
                data: {
                    isDefault: false,
                },
            });
        }

        const newAddress = await prisma.address.create({
            data: {
                userId,
                label,
                name,
                street,
                city,
                zip,
                country,
                isDefault,
            },
        });

        res.status(201).json({ success: true, address: newAddress });
    } catch (error) {
        return next(error);
    }
};

//Delete user address
export const deleteUserAddress = async (req: any, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;
        const { addressId } = req.params;

        if(!addressId) {
            return next(new ValidationError("Address ID is required"));
        }

        const existingAddress = await prisma.address.findFirst({
            where: {
                id: addressId,
                userId,
            },
        });

        if(!existingAddress) {
            return next(new NotFoundError("Address not found or unauthorized"));
        }

        await prisma.address.delete({
            where: {
                id: addressId,
            },
        });

        res.status(200).json({ success: true, message: "Address deleted successfully" });
    } catch (error) {
        return next(error);
    }
};

//Get shipping addresses of user
export const getUserAddresses = async (req: any, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id;

        const addresses = await prisma.address.findMany({
            where: {
                userId,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        
        res.status(200).json({ success: true, addresses });
    } catch (error) {
        next(error);
    }
};

//Login admin
export const loginAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {email, password} = req.body;

        if(!email || !password) {
            return next(new ValidationError("Email and password are required!"));
        }

        const user = await prisma.users.findUnique({
            where: {
                email
            },
        });

        if(!user) {
            return next(new AuthError("User doesn't exists!"));
        }

        const isMatch = await bcrypt.compare(password, user.password!);
        if(!isMatch) {
            return next(new AuthError("Invalid email or password."));
        }

        const isAdmin = user.role === "admin";

        if(!isAdmin) {
            return next(new AuthError("Invalid access"));
        }

        res.clearCookie("seller-access-token");
        res.clearCookie("seller-refresh-token");

        //generate access and refresh token
        const accessToken = jwt.sign(
            {id: user.id, role: "admin"},
            process.env.ACCESS_TOKEN_SECRET as string,
            {
                expiresIn: "15m",
            }
        );

        const refreshToken = jwt.sign(
            {id: user.id, role: "admin"},
            process.env.REFRESH_TOKEN_SECRET as string,
            {
                expiresIn: "7d",
            }
        );

        //store the refresh and access token in an httpOnly secure cookie
        setCookie(res, "refresh_token", refreshToken);
        setCookie(res, "access_token", accessToken);

        await sendLog({ type: "success", message: `Admin login successful ${user.email}`, source: "auth-service" });
        res.status(200).json({
            message: "Login successful!",
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (error) {
        await sendLog({ type: "error", message: `Error in loginAdmin: ${(error as any)?.message || error}`, source: "auth-service" });
        return next(error);
    }
};

//Logout admin
export const logOutAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.clearCookie("access_token");
        res.clearCookie("refresh_token");

        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

//Fetch layout data
export const getLayoutData = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const layout = await prisma.site_config.findFirst();

        res.status(200).json({
            success: true,
            layout,
        });
    } catch (error) {
        next(error);
    }
};