import type { Metadata } from "next";
import AuthScreen from "../AuthScreen";

export const metadata:Metadata={title:"Register — ClearCheck"};

export default function RegisterPage(){return <AuthScreen key="register" mode="register"/>}
