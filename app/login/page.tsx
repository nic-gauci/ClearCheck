import type { Metadata } from "next";
import AuthScreen from "../AuthScreen";

export const metadata:Metadata={title:"Log in — ClearCheck"};

export default function LoginPage(){return <AuthScreen key="login" mode="login"/>}
