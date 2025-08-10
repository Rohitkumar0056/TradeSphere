import { NextFunction, Request, Response } from "express";
import { validateRegistrationData, checkOtpRestrictions, trackOtpRequests, sendOtp, verifyOtp, handleForgotPassword, verifyForgotPasswordOtp } from "../utils/auth.helper";
import prisma from "@packages/libs/prisma";
import { ValidationError, AuthError } from "@packages/error-handler";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { setCookie } from "../utils/cookies/setCookie";

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