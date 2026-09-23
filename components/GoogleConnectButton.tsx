"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api";
import type { GoogleAuthUrlResponse, GoogleStatus } from "@/lib/api-types";
import { Mail, CheckCircle2, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
    access_denied: "Google access was not granted.",
    session_expired: "The connection attempt expired. Please try again.",
    connection_failed: "Google rejected the connection. Please try again.",
};

export default function GoogleConnectButton() {
    const [status, setStatus] = useState<GoogleStatus>({ connected: false });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkStatus();
        // Check URL params for callback result
        const params = new URLSearchParams(window.location.search);
        if (params.get("google_connected") === "true") {
            toast.success("Google account connected successfully!");
            checkStatus();
            // Clean up URL
            window.history.replaceState({}, "", window.location.pathname);
        }
        const googleError = params.get("google_error");
        if (googleError) {
            toast.error(GOOGLE_ERROR_MESSAGES[googleError] ?? `Google connection failed: ${googleError}`);
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, []);

    const checkStatus = async () => {
        try {
            const data = await apiFetch<GoogleStatus>("/auth/google/status");
            setStatus(data);
        } catch (error) {
            console.error("Error checking Google status:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            setLoading(true);
            // Come back to this page after consent so the result toast is shown here.
            const returnTo = encodeURIComponent(window.location.pathname);
            const { auth_url } = await apiFetch<GoogleAuthUrlResponse>(
                `/auth/google?return_to=${returnTo}`
            );
            window.location.href = auth_url;
        } catch (error) {
            console.error("Error connecting Google:", error);
            toast.error("Failed to connect Google account");
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            setLoading(true);
            await apiFetch("/auth/google/disconnect", { method: "POST" });
            setStatus({ connected: false });
            toast.success("Google account disconnected");
        } catch (error) {
            console.error("Error disconnecting Google:", error);
            toast.error("Failed to disconnect");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Button variant="outline" size="sm" disabled>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Checking...
            </Button>
        );
    }

    if (status.connected) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{status.email}</span>
                                <span className="sm:hidden">Connected</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={handleDisconnect}
                            >
                                <LogOut className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Google account connected as {status.email}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleConnect}
            className="gap-2 border-blue-500/20 hover:bg-blue-500/5 hover:border-blue-500/30 text-blue-600 dark:text-blue-400"
        >
            <Mail className="h-4 w-4" />
            Connect Gmail
        </Button>
    );
}
